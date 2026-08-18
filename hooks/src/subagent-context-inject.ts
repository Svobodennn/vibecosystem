/**
 * Subagent Context Inject - SubagentStart hook
 *
 * Her subagent spawn olduğunda, "Agent Output Contract"ını ÖNCEDEN context'e
 * enjekte eder. Böylece agent, işi bittikten sonra sürpriz bir SubagentStop
 * block'uyla karşılaşmak yerine çıktısını baştan bu sözleşmeye göre planlar.
 *
 * Neden gerekli (2026-07-13): Agent/Task tool parent'a agent'ın YALNIZCA son
 * mesajını döndürür. SubagentStop enforcement'ı (subagent-stop-learner) hata
 * raporu yoksa block atıp ekstra tur ürettiriyordu; agent o turda sadece kısa
 * raporu yazıp asıl bulguları gömüyordu. 124 agent tanımının HİÇBİRİ bu
 * sözleşmeyi içermiyordu — agent formatı ilk kez block anında görüyordu.
 * Bu hook sözleşmeyi tüm agent'lara (tek yerden) proaktif verir:
 *   - "son mesaj tek başına tam olmalı" → bulgu gömülmesini önler
 *   - benign vs gerçek hata ayrımı → gereksiz/eksik raporu önler
 *   - "## HATA RAPORU" + "TASK STATUS" formatı → enforcement ile birebir uyumlu
 *
 * SubagentStart context injection yapabilir, block YAPAMAZ (hook-developer ref).
 * Çıktı formatı: hookSpecificOutput.additionalContext (SessionStart ile analog);
 * fail-open — desteklenmezse sessizce görmezden gelinir, zarar yok.
 *
 * Gerçek SubagentStart input şeması (canavar-subagent-tracker, 2026-06-04 probe):
 *   { session_id, transcript_path, cwd, agent_id, agent_type, hook_event_name }
 */
import { readFileSync } from 'fs';

interface SubagentStartInput {
  session_id?: string;
  hook_event_name?: string;
  agent_id?: string;
  agent_type?: string;
}

/**
 * Enjekte edilen sözleşme. Kısa tutuldu (her spawn'da eklenir → token maliyeti).
 * İngilizce: agent'ların çalışma dili + reaktif enforcement metni de İngilizce,
 * "## HATA RAPORU" başlığı literal (SubagentStop regex'i onu arıyor).
 */
const OUTPUT_CONTRACT = `## Agent Output Contract (plan your output around this)

Only your FINAL message is returned to the parent — earlier turns are discarded. Your final message must therefore be COMPLETE on its own: always include your full findings/answer in it.

If a REAL tool error happened during the task (a command genuinely failed and left a result you cannot trust), end your final message with a short section titled "## HATA RAPORU":
- the command/tool that failed and the error
- what you did about it (fixed / workaround / skipped)
- whether it leaves the task INCOMPLETE or affects correctness
then one final line: "TASK STATUS: COMPLETE" or "TASK STATUS: PARTIAL — <what remains>".

These are NOT errors — do NOT report them: grep/find/ls with no matches (exit 1), "file not found" probes, "no such tool available" fallbacks, or a command you simply re-ran successfully. Report genuine failures honestly, but NEVER shorten or drop your findings in order to write the report.`;

function main(): void {
  let raw = '';
  try { raw = readFileSync(0, 'utf-8'); } catch { console.log('{}'); return; }
  if (!raw) { console.log('{}'); return; }

  let input: SubagentStartInput;
  try { input = JSON.parse(raw); } catch { console.log('{}'); return; }

  if (input.hook_event_name !== 'SubagentStart') { console.log('{}'); return; }

  const output = {
    hookSpecificOutput: {
      hookEventName: 'SubagentStart',
      additionalContext: OUTPUT_CONTRACT,
    },
  };
  console.log(JSON.stringify(output));
}

main();
