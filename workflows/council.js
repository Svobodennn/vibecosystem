export const meta = {
  name: 'council',
  description: 'Adversarial konsey: iddiaları çürüt, ampirik kanıtla, yapısal kokuları ayrı hatta yargıla',
  whenToUse: 'Yüksek yıkım yarıçapı olan değişiklikler (auth/payment/migration/public API/hooks), qa-loop 2. retry, reviewer çelişkisi veya kanıtsız iddia sinyali',
  phases: [
    { title: 'Toplama', detail: 'aday iddiaları çıkar (claims verilmediyse)' },
    { title: 'Kor tur', detail: 'çürütücü iddiayı gerekçesiz görür' },
    { title: 'Kanit', detail: 'defect iddialarını reprodüce et' },
    { title: 'Reconsider', detail: 'çürütücü kanıt karşısında oyunu gözden geçirir' },
    { title: 'Yaricap', detail: 'geri alınabilirlik + yapısal ikinci görüş' },
    { title: 'Sadelik', detail: 'en küçük doğru değişiklik mi' },
    { title: 'Karar', detail: 'karar kuralı + azınlık görüşü + oy telemetrisi' },
  ],
}

const CLAIMS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['claims'],
  properties: {
    claims: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'lane', 'summary', 'file', 'rationale'],
        properties: {
          id: { type: 'string' },
          lane: { type: 'string', enum: ['defect', 'structural'] },
          summary: { type: 'string' },
          file: { type: 'string' },
          line: { type: 'integer' },
          rationale: { type: 'string' },
        },
      },
    },
  },
}

const REFUTE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['refuted', 'refutation_kind', 'evidence', 'confidence'],
  properties: {
    refuted: { type: 'boolean' },
    refutation_kind: {
      type: 'string',
      enum: ['code_grounded', 'unreachable', 'precondition', 'wrong_layer', 'already_guarded', 'none'],
    },
    evidence: { type: 'string' },
    confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
    leaked_reasoning: { type: 'boolean' },
    changed_because: { type: 'string' },
    // Dosyaya erişilemedi / path uyuşmadı → çürütme DEĞİL, unproven.
    unresolved: { type: 'boolean' },
  },
}

const EMPIRICAL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['reproduced', 'attempted', 'evidence'],
  properties: {
    reproduced: { type: 'boolean' },
    attempted: { type: 'boolean' },
    blocked_by: { type: ['string', 'null'] },
    evidence: { type: 'string' },
    minimal_repro: { type: 'string' },
    wrong_lane: { type: 'boolean' },
  },
}

const BLAST_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['reversibility', 'surface', 'detectability', 'structural_verdicts'],
  properties: {
    reversibility: { type: 'string', enum: ['revertable', 'costly', 'irreversible'] },
    irreversible_mechanism: { type: ['string', 'null'] },
    surface: { type: 'string' },
    detectability: { type: 'string' },
    structural_verdicts: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['claim_id', 'concur', 'verdict'],
        properties: {
          claim_id: { type: 'string' },
          concur: { type: 'boolean' },
          verdict: { type: 'string', enum: ['rejected', 'advisory', 'blocking'] },
          trajectory: { type: 'string' },
          evidence: { type: 'string' },
          // Bu İDDİAYA ait geri dönüşsüz mekanizma. Global reversibility 'costly' olsa bile
          // tek bir iddia tek yönlü olabilir — global alana bağlamak bulguyu bastırıyordu.
          irreversible_mechanism: { type: ['string', 'null'] },
        },
      },
    },
  },
}

const SIMPLIFY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['notes'],
  properties: {
    duplicate_of: { type: ['string', 'null'] },
    notes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['kind', 'file', 'what'],
        properties: {
          kind: { type: 'string' },
          file: { type: 'string' },
          line: { type: 'integer' },
          what: { type: 'string' },
          smaller_alternative: { type: 'string' },
          saves: { type: 'string' },
        },
      },
    },
  },
}

// args JSON string olarak gelirse (yaygın çağrı hatası) sessizce finder'a düşme — parse et.
let a = args || {}
if (typeof a === 'string') {
  try {
    a = JSON.parse(a)
    log('UYARI: args JSON string olarak geldi, parse edildi. Doğrusu: gerçek JSON objesi geçmek.')
  } catch (e) {
    log(`UYARI: args string ve parse edilemedi (${e.message}) — varsayılanlarla devam.`)
    a = {}
  }
}
const target = a.target || 'HEAD değişiklikleri (git diff)'
// 3 iken yargılanmayan tek defect iddiası gerçek bir bug çıktı (koşum #1, HintTray/WCAG).
// Kapıyı sessiz yapmak o bulguyu yok ederdi; sınırı yükseltip logging'i koruyoruz.
const maxClaims = a.maxClaims || 5

// ---- Toplama: iddialar verilmediyse üret --------------------------------
let claims = Array.isArray(a.claims) ? a.claims : null

if (!claims) {
  phase('Toplama')
  const finders = [
    {
      label: 'find:quality',
      agentType: 'code-reviewer',
      prompt:
        `İnceleme hedefi: ${target}\n\n` +
        'Aday iddiaları çıkar. Her iddia için lane belirle:\n' +
        '- lane="defect": çalıştırılarak reprodüce EDİLEBİLİR bir hata (yanlış sonuç, crash, veri bozulması, regresyon).\n' +
        '- lane="structural": reprodüce EDİLEMEZ yapısal risk (katman ihlali, coupling, gelecekteki race, ölçeklenme).\n' +
        'Emin olmadığın iddiayı da yaz — konsey elemesi yapacak. Fix ÖNERME.',
    },
    {
      label: 'find:security',
      agentType: 'security-reviewer',
      prompt:
        `İnceleme hedefi: ${target}\n\n` +
        'Güvenlik aday iddialarını çıkar (secrets, injection, authz bypass, SSRF, crypto, PII sızıntısı).\n' +
        'lane="defect" reprodüce edilebilirse, aksi hâlde lane="structural". Fix ÖNERME.',
    },
  ]

  const found = await parallel(
    finders.map((f) => () =>
      agent(f.prompt, { label: f.label, phase: 'Toplama', schema: CLAIMS_SCHEMA, agentType: f.agentType })
    )
  )

  claims = found
    .filter(Boolean)
    .flatMap((r) => r.claims || [])
    .map((c, i) => ({ ...c, id: c.id || `C${i + 1}` }))
}

if (!claims.length) {
  log('Aday iddia yok — konsey toplanmadı.')
  return { gate: 'PASS_WITH_NOTES', claims: [], note: 'no candidate claims' }
}

// Maliyet kapısı: sessiz kırpma YAPMA, düşenleri bildir.
const defects = claims.filter((c) => c.lane === 'defect')
const structural = claims.filter((c) => c.lane !== 'defect')
const judgedDefects = defects.slice(0, maxClaims)
const droppedDefects = defects.slice(maxClaims)

if (droppedDefects.length) {
  log(
    `DIKKAT: ${droppedDefects.length} defect iddiası maxClaims=${maxClaims} sınırı nedeniyle yargılanmadı: ` +
      droppedDefects.map((c) => `${c.id} (${c.file})`).join(', ')
  )
}
log(`Konsey: ${judgedDefects.length} defect + ${structural.length} structural iddia.`)

// Baglam asimetrisi: çürütücü SADECE iddiayı görür, üreten agent'ın gerekçesini GÖRMEZ.
// `workspace` gerekçe değil KONUM bilgisidir — düşürülürse çürütücü göreli path'i yanlış
// dizinde arar ve "kod yok" diye gerçek bir bug'ı gömer (gerçek bir koşumda oldu).
function blindClaim(c) {
  return JSON.stringify({
    workspace: target,
    id: c.id,
    lane: c.lane,
    summary: c.summary,
    file: c.file,
    line: c.line,
  })
}

// ---- Uc hat paralel: defect zinciri | yaricap | sadelik ----------------
const [defectResults, blast, simplify] = await parallel([
  // Hat 1: her defect iddiası bağımsız zincirden geçer (barrier yok).
  () =>
    pipeline(
      judgedDefects,
      // Kör tur
      (c) =>
        agent(
          'Aşağıdaki iddiayı ÇÜRÜTMEYE çalış. Sana gerekçe VERİLMEDİ, bu kasıtlı — koda kendin bak.\n' +
            'Şüphedeysen refuted=true.\n\n' +
            blindClaim(c),
          { label: `refute:${c.id}`, phase: 'Kor tur', schema: REFUTE_SCHEMA, agentType: 'council-refuter' }
        ),
      // Kanıt turu — kör tur çürüttüyse para harcamayı bırak
      (first, c) => {
        if (!first) return { first: null, empirical: null }
        // Erişemedi (unresolved) ise çürütmüş sayılmaz — Kanıtçı yine koşar.
        if (first.refuted && !first.unresolved) return { first, empirical: null, skipped: 'refuted_blind' }
        return agent(
          'İddiayı REPRODÜCE et. Komut koş, çıktıyı yapıştır.\n' +
            'Göreli path\'ler `workspace` köküne göredir — başka dizin taramayın.\n' +
            'Koşamazsanız `blocked_by` doldurun; "koşamadım" ile "hata yok" AYNI ŞEY DEĞİL.\n\n' +
            JSON.stringify({ workspace: target, ...c }),
          { label: `prove:${c.id}`, phase: 'Kanit', schema: EMPIRICAL_SCHEMA, agentType: 'council-empiricist' }
        ).then((empirical) => ({ first, empirical }))
      },
      // Reconsider — kanıt karşısında oy değişebilir
      (prev, c) => {
        if (!prev || !prev.first) return null
        if (!prev.empirical) return { claim: c, first: prev.first, empirical: null, final: prev.first }
        return agent(
          'Aynı iddiayı yeniden değerlendir. Kanıtçı şu ampirik sonucu üretti:\n\n' +
            JSON.stringify(prev.empirical) +
            `\n\nİddia:\n${blindClaim(c)}\n\n` +
            'Oyunu değiştirmekten çekinme; değiştirdiysen changed_because doldur.',
          { label: `reconsider:${c.id}`, phase: 'Reconsider', schema: REFUTE_SCHEMA, agentType: 'council-refuter' }
        ).then((final) => ({ claim: c, first: prev.first, empirical: prev.empirical, final }))
      }
    ),

  // Hat 2: yarıçap + yapısal ikinci görüş (structural lane'in tek kapısı)
  () =>
    agent(
      `Hedef: ${target}\n\n` +
        'İş 1: değişikliğin yarıçapını ve geri alınabilirliğini ölç.\n' +
        'İş 2: aşağıdaki YAPISAL iddialara ikinci görüş ver. Bunlar reprodüce edilemez;\n' +
        'somut arıza güzergâhı yoksa rejected, varsa advisory, güzergâh + adlandırılmış\n' +
        'irreversible mekanizma varsa blocking.\n\n' +
        JSON.stringify(structural),
      { label: 'blast-radius', phase: 'Yaricap', schema: BLAST_SCHEMA, agentType: 'council-blast-radius' }
    ),

  // Hat 3: sadelik (her zaman advisory, gate'i etkilemez)
  () =>
    agent(
      `Hedef: ${target}\n\nBu, doğru olan en küçük değişiklik mi? Ölçüsü olmayan not düşme.`,
      { label: 'simplify', phase: 'Sadelik', schema: SIMPLIFY_SCHEMA, agentType: 'council-simplifier' }
    ),
])

// ---- Karar kurali: kodda, prompt'ta degil ------------------------------
const rows = (defectResults || []).filter(Boolean)

const defectVerdicts = rows.map((r) => {
  const first = r.first
  const final = r.final || r.first
  const emp = r.empirical
  // unresolved ASLA kill sayılmaz: "erişemedim" ile "iddia yanlış" farklı sonuçlar.
  const blindKill = !!(first && first.refuted && !first.unresolved)
  const finalKill = !!(final && final.refuted && !final.unresolved)

  let status
  if (!first) status = 'unproven'
  else if (blindKill && !emp) status = 'killed'
  else if (finalKill) status = 'killed'
  else if (!emp) status = 'unproven'
  else if (emp.wrong_lane) status = 'advisory'
  else if (emp.reproduced) status = 'blocking'
  // SIRA KRİTİK: blocked_by, attempted'dan ÖNCE bakılır. Koşamamış bir repro
  // aktif çürütme değildir — bu sıra ters olduğu için gerçek bir bug killed'a düştü.
  else if (emp.blocked_by) status = 'unproven'
  else if (emp.attempted) status = 'killed'
  else status = 'unproven'

  return {
    claim_id: r.claim.id,
    lane: 'defect',
    status,
    first_vote: first ? (first.refuted ? 'refuted' : 'survives') : 'no_vote',
    final_vote: final ? (final.refuted ? 'refuted' : 'survives') : 'no_vote',
    flipped: !!(first && final && first.refuted !== final.refuted),
    flip_reason: (final && final.changed_because) || null,
    empirical: emp ? { reproduced: emp.reproduced, attempted: emp.attempted, blocked_by: emp.blocked_by || null } : null,
    evidence: emp ? emp.evidence : first ? first.evidence : null,
    summary: r.claim.summary,
    file: r.claim.file,
  }
})

// structural: Kanıtçı vetosu GEÇMEZ. Blocking yalnızca adlandırılmış irreversible mekanizmayla.
const irreversibleNamed = !!(blast && blast.reversibility === 'irreversible' && blast.irreversible_mechanism)
const sv = (blast && blast.structural_verdicts) || []

const structuralVerdicts = structural.map((c) => {
  const v = sv.find((x) => x.claim_id === c.id)
  let status = v ? v.verdict : 'advisory'
  let downgraded = null
  // Mekanizma İDDİA seviyesinde ya da global olarak adlandırılmışsa blocking geçerli.
  // Eskiden yalnız global'e bakılıyordu; global 'costly' iken tek-yönlü bir güvenlik
  // bulgusu (self-mint XP) advisory'ye düşürüldü ve gerekçe de yanlış yazıldı.
  const mechNamed = !!((v && v.irreversible_mechanism) || irreversibleNamed)
  if (status === 'blocking' && !mechNamed) {
    status = 'advisory'
    downgraded = 'geri dönüşsüz mekanizma ne iddiada ne global yarıçapta adlandırıldı'
  }
  return {
    claim_id: c.id,
    lane: 'structural',
    status,
    downgraded,
    trajectory: v ? v.trajectory : null,
    concur: v ? v.concur : false,
    summary: c.summary,
    file: c.file,
  }
})

const all = defectVerdicts.concat(structuralVerdicts)
const blocking = all.filter((v) => v.status === 'blocking')
const gate = blocking.length ? 'BLOCK' : 'PASS_WITH_NOTES'
const flips = defectVerdicts.filter((v) => v.flipped).length

log(`Karar: ${gate} — ${blocking.length} bloklayıcı, oy değişimi ${flips}/${defectVerdicts.length}`)

// ---- Reis: sentez + azinlik gorusu + oy telemetrisi -------------------
phase('Karar')
const report = await agent(
  'Konsey çıktılarını sentezle. Karar kuralı SCRIPT tarafından zaten uygulandı — ' +
    'statüleri DEĞİŞTİRME, sadece raporla ve gerekçelendir.\n\n' +
    `GATE: ${gate}\n` +
    `Yıkım yarıçapı: ${JSON.stringify(blast)}\n` +
    `Sadelik notları: ${JSON.stringify(simplify)}\n` +
    `Kararlar: ${JSON.stringify(all)}\n` +
    `Ham turlar (ilk/son oy, kanıt): ${JSON.stringify(rows)}\n` +
    (droppedDefects.length
      ? `YARGILANMAYAN iddialar (maxClaims sınırı): ${JSON.stringify(droppedDefects)} — raporda AÇIKÇA belirt.\n`
      : '') +
    '\nZORUNLU: her defect iddiası için council-votes.jsonl satırını yaz (ts için `date -u +%FT%TZ`).\n' +
    'Azınlık görüşünü ve unproven maddeleri yuvarlamadan aktar.',
  { label: 'chair', phase: 'Karar', agentType: 'council-chair' }
)

return {
  gate,
  blocking: blocking.length,
  flips,
  judged: defectVerdicts.length,
  structural: structuralVerdicts.length,
  unjudged: droppedDefects.map((c) => c.id),
  verdicts: all,
  reversibility: blast ? blast.reversibility : null,
  report,
}
