<?php
// Sky Armada duels: two people play one battle, taking turns whenever it suits them.
//
// * A duel is just its starting setup (seed, factions, deck) and the list of moves. The game engine
//   is deterministic, so each phone replays the moves to get the same battle. No accounts: the
//   person who starts a duel gets an invite link to send; whoever opens it first takes the other seat.
// * Each seat has a secret token (kept on that phone), so only the two players can make moves.
// * Data lives outside the public website, next to the family sync data (see sync.php).

declare(strict_types=1);

const ID_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O or 1/I/L to mix up
const ID_LEN = 6;
const MAX_ACTIONS = 1500;
const MAX_CREATES = 40;       // new duels per IP per day
const MAX_MISSES = 60;        // lookups of duels that don't exist, per IP per hour
const EXPIRE_DAYS = 60;       // duels untouched this long are deleted
const NAME_MAX = 20;

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function fail(int $status, string $msg): never {
    http_response_code($status);
    echo json_encode(['ok' => false, 'error' => $msg]);
    exit;
}

function done(array $data = []): never {
    echo json_encode(['ok' => true] + $data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

/** The private data folder (same rules as sync.php). */
function dataDir(): string {
    $env = getenv('GAMES_DATA_DIR');
    $candidates = array_filter([$env ?: null, dirname(__DIR__, 3) . '/games-data', __DIR__ . '/data']);
    foreach ($candidates as $dir) {
        if ((is_dir($dir) || @mkdir($dir, 0700, true)) && is_writable($dir)) {
            if (realpath($dir) === realpath(__DIR__ . '/data')) {
                if (!file_exists("$dir/.htaccess")) file_put_contents("$dir/.htaccess", "Require all denied\nDeny from all\n");
                if (!file_exists("$dir/index.html")) file_put_contents("$dir/index.html", '');
            }
            return $dir;
        }
    }
    fail(500, 'No storage available');
}

function readJson(string $path, $default) {
    if (!is_file($path)) return $default;
    $v = json_decode((string) file_get_contents($path), true);
    return $v ?? $default;
}

function writeJson(string $path, $value): void {
    $tmp = $path . '.' . bin2hex(random_bytes(4)) . '.tmp';
    file_put_contents($tmp, json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
    rename($tmp, $path);
}

function limitFile(string $dir, string $kind): string {
    @mkdir("$dir/limits", 0700, true);
    $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
    return "$dir/limits/duel-$kind-" . substr(hash('sha256', $ip . 'skyarmada-duels'), 0, 24) . '.json';
}

function tooMany(string $dir, string $kind, int $max, int $window): bool {
    $l = readJson(limitFile($dir, $kind), ['n' => 0, 'since' => time()]);
    return time() - $l['since'] <= $window && $l['n'] >= $max;
}

function bump(string $dir, string $kind, int $window): void {
    $path = limitFile($dir, $kind);
    $l = readJson($path, ['n' => 0, 'since' => time()]);
    if (time() - $l['since'] > $window) $l = ['n' => 0, 'since' => time()];
    $l['n']++;
    writeJson($path, $l);
}

function cleanName($v): string {
    $s = trim(preg_replace('/[\x00-\x1F\x7F<>]/u', '', (string) $v) ?? '');
    $s = mb_substr($s, 0, NAME_MAX);
    return $s === '' ? 'Captain' : $s;
}

function cleanFaction($v): string {
    $s = (string) $v;
    if (!preg_match('/^[a-z]{2,24}$/', $s)) fail(400, 'Bad faction');
    return $s;
}

/** A move, exactly as the engine takes it: play or discard the card at a hand index, or use a power. */
function cleanAction($a): array {
    if (!is_array($a)) fail(400, 'Bad move');
    $kind = $a['kind'] ?? '';
    if ($kind === 'power') return ['kind' => 'power'];
    if ($kind !== 'play' && $kind !== 'discard') fail(400, 'Bad move');
    $index = $a['index'] ?? null;
    if (!is_int($index) || $index < 0 || $index > 30) fail(400, 'Bad move');
    $out = ['kind' => $kind, 'index' => $index];
    if ($kind === 'play' && isset($a['choice'])) {
        if (!is_int($a['choice']) || $a['choice'] < 0 || $a['choice'] > 9) fail(400, 'Bad move');
        $out['choice'] = $a['choice'];
    }
    return $out;
}

/** What the phones see: everything except the seat tokens. */
function publicDuel(array $d): array {
    unset($d['tokens']);
    return $d;
}

/** Which seat this token belongs to, or a 403. */
function seatOf(array $d, string $token): int {
    foreach ([0, 1] as $s) {
        if (isset($d['tokens'][$s]) && $d['tokens'][$s] !== null && hash_equals($d['tokens'][$s], hash('sha256', $token))) return $s;
    }
    fail(403, 'Not a player in this duel');
}

function newToken(): string {
    return bin2hex(random_bytes(16));
}

// ── Request ─────────────────────────────────────────────────────

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') fail(405, 'Use POST');

$dir = dataDir() . '/duels';
@mkdir($dir, 0700, true);
$root = dirname($dir);
$action = (string) ($_GET['action'] ?? '');
$body = json_decode((string) file_get_contents('php://input', false, null, 0, 256 * 1024), true);
if (!is_array($body)) $body = [];

$pathOf = function (string $id) use ($dir): string {
    if (!preg_match('/^[' . ID_CHARS . ']{' . ID_LEN . '}$/', $id)) fail(400, 'Bad duel code');
    return "$dir/$id.json";
};

/** Load a duel under an exclusive lock, let $fn change it, save it. */
$withDuel = function (string $id, callable $fn) use ($pathOf, $root) {
    $path = $pathOf($id);
    if (!is_file($path)) {
        bump($root, 'miss', 3600);
        fail(404, 'No duel with that code');
    }
    $lock = fopen("$path.lock", 'c');
    flock($lock, LOCK_EX);
    $d = readJson($path, null);
    if (!is_array($d)) fail(500, 'Broken duel');
    $out = $fn($d);
    $d['updated'] = time();
    writeJson($path, $d);
    flock($lock, LOCK_UN);
    fclose($lock);
    return [$d, $out];
};

if (tooMany($root, 'miss', MAX_MISSES, 3600)) fail(429, 'Too many tries. Try again in an hour.');

switch ($action) {
    case 'create': {
        if (tooMany($root, 'create', MAX_CREATES, 86400)) fail(429, 'Too many new duels today.');
        // Tidy up: duels nobody has touched in a long time.
        foreach (glob("$dir/*.json") ?: [] as $f) {
            if (filemtime($f) < time() - EXPIRE_DAYS * 86400) {
                @unlink($f);
                @unlink("$f.lock");
            }
        }
        $deck = $body['deck'] ?? null;
        if (!is_array($deck) || count($deck) < 10 || count($deck) > 300) fail(400, 'Bad deck');
        foreach ($deck as $c) if (!is_string($c) || !preg_match('/^[a-z0-9_+~-]{1,40}$/', $c)) fail(400, 'Bad deck');
        do {
            $id = '';
            for ($i = 0; $i < ID_LEN; $i++) $id .= ID_CHARS[random_int(0, strlen(ID_CHARS) - 1)];
        } while (is_file("$dir/$id.json"));
        $token = newToken();
        $d = [
            'v' => 1,
            'id' => $id,
            'created' => time(),
            'updated' => time(),
            'seed' => random_int(0, 2 ** 31 - 1),
            'deck' => array_values($deck),
            'names' => [cleanName($body['name'] ?? ''), null],
            'factions' => [cleanFaction($body['faction'] ?? ''), null],
            'tokens' => [hash('sha256', $token), null],
            'actions' => [],
            'winner' => null, // 0, 1 or 'draw' once it's over
            'resigned' => null, // the seat that gave up
        ];
        writeJson("$dir/$id.json", $d);
        bump($root, 'create', 86400);
        done(['duel' => publicDuel($d), 'seat' => 0, 'token' => $token]);
    }

    case 'get': {
        // One or more duels at once (the duel list asks about all of yours together).
        $ids = $body['ids'] ?? [];
        if (!is_array($ids) || count($ids) > 60) fail(400, 'Bad request');
        $out = [];
        foreach ($ids as $id) {
            if (!is_string($id)) continue;
            $path = $pathOf($id);
            $d = readJson($path, null);
            $out[$id] = is_array($d) ? publicDuel($d) : null;
        }
        if (count($ids) === 1 && $out[$ids[0]] === null) bump($root, 'miss', 3600);
        done(['duels' => (object) $out]);
    }

    case 'join': {
        $token = newToken();
        [$d] = $withDuel((string) ($body['id'] ?? ''), function (array &$d) use ($body, $token) {
            if ($d['tokens'][1] !== null) fail(409, 'Someone already took this duel');
            $d['names'][1] = cleanName($body['name'] ?? '');
            $d['factions'][1] = cleanFaction($body['faction'] ?? '');
            $d['tokens'][1] = hash('sha256', $token);
        });
        done(['duel' => publicDuel($d), 'seat' => 1, 'token' => $token]);
    }

    case 'move': {
        // Append moves. `from` is how many moves the phone already had, so two phones can't both
        // add a move at the same spot (the second is told to reload).
        [$d] = $withDuel((string) ($body['id'] ?? ''), function (array &$d) use ($body) {
            seatOf($d, (string) ($body['token'] ?? ''));
            if ($d['tokens'][1] === null) fail(409, 'Waiting for an opponent');
            if ($d['winner'] !== null) fail(409, 'This duel is over');
            $from = $body['from'] ?? -1;
            if ($from !== count($d['actions'])) fail(409, 'Out of date');
            $moves = $body['actions'] ?? [];
            if (!is_array($moves) || !$moves || count($d['actions']) + count($moves) > MAX_ACTIONS) fail(400, 'Bad moves');
            foreach ($moves as $m) $d['actions'][] = cleanAction($m);
            $w = $body['winner'] ?? null;
            if ($w === 0 || $w === 1 || $w === 'draw') $d['winner'] = $w;
        });
        done(['duel' => publicDuel($d)]);
    }

    case 'resign': {
        [$d] = $withDuel((string) ($body['id'] ?? ''), function (array &$d) use ($body) {
            $seat = seatOf($d, (string) ($body['token'] ?? ''));
            if ($d['winner'] !== null) return;
            if ($d['tokens'][1] === null) {
                $d['winner'] = 'cancelled'; // never accepted: just withdraw the invite
                return;
            }
            $d['winner'] = 1 - $seat;
            $d['resigned'] = $seat;
        });
        done(['duel' => publicDuel($d)]);
    }
}

fail(400, 'Unknown action');
