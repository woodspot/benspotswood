// Kids' Games: the page little ones pick a game from. Grown-up settings sit behind ⚙️ and the sum.
import { bindVoiceButton } from '../kids/audio';
import { lockGestures } from '../kids/hold';
import { bindLangButtons } from '../kids/lang';
import { bindSettings } from '../kids/nav';
import { syncOnOpen } from '../kids/sync';

const $ = (id: string) => document.getElementById(id)!;

bindVoiceButton($('voice'));
bindLangButtons($('lang'));
bindSettings();
lockGestures();
// Family sync: pick up the family's newer settings (language, voice…) for the games.
syncOnOpen(undefined, () => $('grown').hidden && location.reload());
