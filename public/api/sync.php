<?php
// Family sync for the kids games: devices that know the same family code share settings,
// contacts, photos and voice recordings.
//
// * Data lives outside the public website (one folder above public_html), so it can't be
//   downloaded directly. If that folder can't be used, it falls back to a locked folder here.
// * The family code is never stored. Each family's folder is named by a keyed hash of the code,
//   using a random secret created on first use.
// * Wrong codes are rate limited per IP address, so a code can't be guessed by trying many.
//
// Every request sends the code in the X-Family-Code header (not the URL, which ends up in logs).

declare(strict_types=1);

const MAX_FILE_BYTES = 5 * 1024 * 1024;     // one recording
const MAX_FAMILY_BYTES = 300 * 1024 * 1024; // all of a family's recordings
const MAX_FAMILIES = 50;
const MAX_FAILS = 10;                       // wrong codes per IP…
const FAIL_WINDOW = 3600;                   // …per hour
const MAX_CREATES = 5;                      // new families per IP per day
const NAME_RE = '/^[A-Za-z0-9_-]{1,80}\.(m4a|mp4|webm|ogg|wav|mp3|aac)$/';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function fail(int $status, string $msg): never {
    http_response_code($status);
    echo json_encode(['ok' => false, 'error' => $msg]);
    exit;
}

/** A family's state as a JSON object (an empty PHP array would otherwise come out as []). */
function stateOut($state): array|object {
    return is_array($state) && $state ? $state : new stdClass();
}

function done(array $data = []): never {
    echo json_encode(['ok' => true] + $data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

/** The private data folder. */
function dataDir(): string {
    $env = getenv('GAMES_DATA_DIR');
    $candidates = array_filter([$env ?: null, dirname(__DIR__, 3) . '/games-data', __DIR__ . '/data']);
    foreach ($candidates as $dir) {
        if ((is_dir($dir) || @mkdir($dir, 0700, true)) && is_writable($dir)) {
            if (realpath($dir) === realpath(__DIR__ . '/data')) {
                // Inside the website: make sure the web server refuses to serve it.
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

function secret(string $dir): string {
    $path = "$dir/secret.key";
    if (!is_file($path)) {
        file_put_contents($path, bin2hex(random_bytes(32)), LOCK_EX);
        @chmod($path, 0600);
    }
    return trim((string) file_get_contents($path));
}

// ── Rate limiting ───────────────────────────────────────────────

function ipFile(string $dir, string $kind): string {
    @mkdir("$dir/limits", 0700, true);
    $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
    return "$dir/limits/$kind-" . substr(hash('sha256', $ip . secret($dir)), 0, 24) . '.json';
}

function tooMany(string $dir, string $kind, int $max, int $window): bool {
    $l = readJson(ipFile($dir, $kind), ['n' => 0, 'since' => time()]);
    if (time() - $l['since'] > $window) return false;
    return $l['n'] >= $max;
}

function bump(string $dir, string $kind, int $window): void {
    $path = ipFile($dir, $kind);
    $l = readJson($path, ['n' => 0, 'since' => time()]);
    if (time() - $l['since'] > $window) $l = ['n' => 0, 'since' => time()];
    $l['n']++;
    writeJson($path, $l);
}

// ── Request ─────────────────────────────────────────────────────

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') fail(405, 'Use POST');

$dir = dataDir();
$action = (string) ($_GET['action'] ?? '');

if (tooMany($dir, 'fail', MAX_FAILS, FAIL_WINDOW)) fail(429, 'Too many wrong codes. Try again in an hour.');

// Codes are compared without case or extra spaces, so "Blue Tiger" and "blue  tiger" match.
$code = strtolower(preg_replace('/\s+/', ' ', trim((string) ($_SERVER['HTTP_X_FAMILY_CODE'] ?? ''))));
if (strlen($code) < 6 || strlen($code) > 100) fail(400, 'The family code must be at least 6 characters.');

$familiesDir = "$dir/families";
@mkdir($familiesDir, 0700, true);
$id = hash_hmac('sha256', $code, secret($dir));
$family = "$familiesDir/$id";
$files = "$family/files";
$statePath = "$family/state.json";

if ($action === 'create') {
    if (!is_dir($family)) {
        if (tooMany($dir, 'create', MAX_CREATES, 86400)) fail(429, 'Too many new families today.');
        if (count(glob("$familiesDir/*", GLOB_ONLYDIR) ?: []) >= MAX_FAMILIES) fail(507, 'No room for more families.');
        mkdir($files, 0700, true);
        writeJson($statePath, new stdClass());
        bump($dir, 'create', 86400);
    }
    done(['state' => stateOut(readJson($statePath, []))]);
}

// Everything else needs an existing family: a wrong code counts against this IP.
if (!is_dir($family)) {
    bump($dir, 'fail', FAIL_WINDOW);
    fail(404, 'No family with that code.');
}

switch ($action) {
    case 'join':
    case 'pull':
        done(['state' => stateOut(readJson($statePath, []))]);

    case 'push': {
        // Merge changes: for each key, the newest change wins. Values are strings or null (deleted).
        $body = json_decode((string) file_get_contents('php://input'), true);
        $changes = is_array($body['changes'] ?? null) ? $body['changes'] : [];
        $lock = fopen("$family/.lock", 'c');
        flock($lock, LOCK_EX);
        $state = readJson($statePath, []);
        foreach ($changes as $key => $entry) {
            if (!is_string($key) || strlen($key) > 200 || !is_array($entry)) continue;
            $t = (int) ($entry['t'] ?? 0);
            $v = $entry['v'] ?? null;
            if ($v !== null && (!is_string($v) || strlen($v) > 2 * 1024 * 1024)) continue;
            if (!isset($state[$key]) || $t >= (int) $state[$key]['t']) $state[$key] = ['v' => $v, 't' => $t];
        }
        writeJson($statePath, stateOut($state));
        // Remove recordings nothing points at any more.
        $used = [];
        foreach ($state as $key => $entry) {
            if (str_starts_with($key, 'rec:') && is_string($entry['v'])) $used[explode('|', $entry['v'])[1] ?? ''] = true;
        }
        foreach (glob("$files/*") ?: [] as $f) if (!isset($used[basename($f)])) @unlink($f);
        flock($lock, LOCK_UN);
        fclose($lock);
        done(['state' => stateOut($state)]);
    }

    case 'putfile': {
        $name = (string) ($_GET['name'] ?? '');
        if (!preg_match(NAME_RE, $name)) fail(400, 'Bad file name');
        $data = file_get_contents('php://input', false, null, 0, MAX_FILE_BYTES + 1);
        if ($data === false || strlen($data) === 0) fail(400, 'Empty file');
        if (strlen($data) > MAX_FILE_BYTES) fail(413, 'Recording too large');
        $total = array_sum(array_map('filesize', glob("$files/*") ?: []));
        if ($total + strlen($data) > MAX_FAMILY_BYTES) fail(507, 'Family storage is full');
        file_put_contents("$files/$name", $data, LOCK_EX);
        done();
    }

    case 'getfile': {
        $name = (string) ($_GET['name'] ?? '');
        if (!preg_match(NAME_RE, $name) || !is_file("$files/$name")) fail(404, 'No such file');
        header('Content-Type: application/octet-stream');
        header('Content-Length: ' . filesize("$files/$name"));
        readfile("$files/$name");
        exit;
    }

    case 'forget': {
        // Delete this family's data from the server.
        foreach (glob("$files/*") ?: [] as $f) @unlink($f);
        @rmdir($files);
        foreach (glob("$family/{,.}*", GLOB_BRACE) ?: [] as $f) if (is_file($f)) @unlink($f);
        @rmdir($family);
        done();
    }
}

fail(400, 'Unknown action');
