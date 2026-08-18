export const meta = {
  name: 'council-design',
  description: 'Proje yapısı / mimari / karar / görev-kabul incelemesi — sınırlı envanter + alıntı doğrulama',
  whenToUse: 'Proje yapısı, mimari, kararlar, görev kabulleri, tasarım tutarlılığı incelenecekse. Diff incelemesi için council (kardeş workflow) kullanılır.',
  phases: [
    { title: 'Envanter', detail: 'inceleme yüzeyini sonlu listeye indir' },
    { title: 'Bulgu', detail: 'farklı merceklerden aday iddia (envantere bağlı)' },
    { title: 'Alinti', detail: 'çürütücü: alıntı iddiayı gerçekten destekliyor mu' },
    { title: 'Yaricap', detail: 'tek yönlü kapı mı, geri dönülebilir mi' },
    { title: 'Karar', detail: 'karar kuralı + azınlık görüşü' },
  ],
}

const INVENTORY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['docs', 'modules', 'decisions', 'tasks', 'empty'],
  properties: {
    empty: { type: 'boolean' },
    sampling: { type: ['string', 'null'] },
    docs: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['path', 'claims_what'],
        properties: { path: { type: 'string' }, lines: { type: 'integer' }, claims_what: { type: 'string' } },
      },
    },
    modules: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['path', 'responsibility'],
        properties: { path: { type: 'string' }, responsibility: { type: 'string' }, approx_files: { type: 'integer' } },
      },
    },
    decisions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['path', 'what_was_decided'],
        properties: { path: { type: 'string' }, what_was_decided: { type: 'string' }, frozen: { type: 'boolean' } },
      },
    },
    tasks: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['path', 'has_acceptance_criteria'],
        properties: { path: { type: 'string' }, has_acceptance_criteria: { type: 'boolean' } },
      },
    },
    claim_vs_reality: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['doc_ref', 'code_ref', 'what_to_compare'],
        properties: { doc_ref: { type: 'string' }, code_ref: { type: 'string' }, what_to_compare: { type: 'string' } },
      },
    },
  },
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
        required: ['id', 'kind', 'summary', 'citation', 'consequence'],
        properties: {
          id: { type: 'string' },
          kind: {
            type: 'string',
            enum: ['doc_code_conflict', 'undocumented_decision', 'missing_acceptance', 'boundary_violation', 'scope_drift'],
          },
          summary: { type: 'string' },
          // Alıntı ZORUNLU: doğrulanamayan mimari eleştiri gürültüdür.
          citation: { type: 'string' },
          consequence: { type: 'string' },
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
      enum: ['citation_unsupported', 'already_documented', 'no_consequence', 'wrong_layer', 'none'],
    },
    evidence: { type: 'string' },
    confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
    unresolved: { type: 'boolean' },
  },
}

const GATE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['verdicts'],
  properties: {
    verdicts: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['claim_id', 'verdict'],
        properties: {
          claim_id: { type: 'string' },
          verdict: { type: 'string', enum: ['rejected', 'advisory', 'blocking'] },
          one_way_door: { type: ['string', 'null'] },
          trajectory: { type: 'string' },
        },
      },
    },
  },
}

let a = args || {}
if (typeof a === 'string') {
  try {
    a = JSON.parse(a)
    log('UYARI: args JSON string olarak geldi, parse edildi.')
  } catch (e) {
    log(`UYARI: args parse edilemedi (${e.message}) — varsayılanlarla devam.`)
    a = {}
  }
}
const target = a.target || 'mevcut proje dizini'
const maxClaims = a.maxClaims || 6
const focus = a.focus || 'yapı, mimari, kararlar, görev kabulleri, tasarım tutarlılığı'

// ---- Envanter: sinirsiz gezinmeyi burada kesiyoruz ----------------------
phase('Envanter')
const inv = await agent(
  `Hedef: ${target}\nİnceleme odağı: ${focus}\n\n` +
    'İnceleme yüzeyini SONLU bir envantere indir. Bulgu üretme, yorum yapma. ' +
    'En fazla ~40 dosya oku; aşarsan sampling alanında neyi atladığını yaz.',
  { label: 'inventory', phase: 'Envanter', schema: INVENTORY_SCHEMA, agentType: 'council-inventory' }
)

if (!inv || inv.empty) {
  log('Envanter boş — hedef yol yanlış veya okunacak yüzey yok. Konsey toplanmadı.')
  return { gate: 'NO_SURFACE', note: 'inventory empty', inventory: inv }
}

const invDigest = JSON.stringify({
  docs: inv.docs || [],
  modules: inv.modules || [],
  decisions: inv.decisions || [],
  tasks: inv.tasks || [],
  claim_vs_reality: inv.claim_vs_reality || [],
})
log(
  `Envanter: ${(inv.docs || []).length} doküman, ${(inv.modules || []).length} modül, ` +
    `${(inv.decisions || []).length} karar, ${(inv.tasks || []).length} görev artefaktı.` +
    (inv.sampling ? ` Örnekleme: ${inv.sampling}` : '')
)

// ---- Bulgu: farkli mercekler, HEPSI envantere bagli ---------------------
const LENSES = [
  {
    key: 'tutarlilik',
    prompt:
      'MERCEK: doküman ↔ gerçeklik tutarsızlığı. Dokümanın/kararın X dediği ama kodun Y yaptığı yerler. ' +
      'Özellikle "dondurulmuş/kilitli" ilan edilmiş alanların gerçekten dondurulmuş olup olmadığı.',
  },
  {
    key: 'karar',
    prompt:
      'MERCEK: karar kaydı. Kodda/yapıda görünen ama hiçbir yerde gerekçesi yazılmamış kararlar; ' +
      'veya kaydedilmiş ama artık geçerli olmayan kararlar. Tek yönlü kapılara (geri dönülemez tercih) öncelik ver.',
  },
  {
    key: 'kabul',
    prompt:
      'MERCEK: görev ve kabul kriteri. Kabul kriteri olmayan görevler, test edilemez biçimde yazılmış ' +
      '"done-when" tanımları, bitmiş sayılan ama kanıtı olmayan işler, kapsam kayması (scope drift).',
  },
]

phase('Bulgu')
const found = await parallel(
  LENSES.map((l, li) => () =>
    agent(
      `Hedef: ${target}\n\n${l.prompt}\n\n` +
        'AŞAĞIDAKİ ENVANTERE BAĞLI KAL. Envanterde olmayan dosyaya dalma; gerekiyorsa ' +
        'envanterdeki bir yolu derinleştir, ama ağaç gezmeye başlama.\n\n' +
        `ENVANTER:\n${invDigest}\n\n` +
        'HER İDDİA İÇİN `citation` ZORUNLU: dosya:satır veya doküman başlığı, iddia edileni ' +
        'gerçekten söyleyen yer. Alıntısı olmayan iddia yazma — otomatik çürütülür. ' +
        '`consequence` alanına izlenebilir sonucu yaz ("X değişince Y sessizce bozulur"); ' +
        'sonucu olmayan tercih beyanı yazma. Fix ÖNERME.',
      { label: `find:${l.key}`, phase: 'Bulgu', schema: CLAIMS_SCHEMA, agentType: 'scout' }
    ).then((r) => ({ lens: l.key, li, claims: (r && r.claims) || [] }))
  )
)

// Id'yi MERCEK PREFIKSIYLE yeniden yaz. Agent'ların verdiği id'ler mercekler arasında
// çakışıyordu (iki mercek de C1..C9 üretti); gate `claim_id` ile eşleştirdiği için
// çakışma yanlış iddiaya yanlış karar bağlayabilirdi.
const perLens = (found || []).filter(Boolean).map((r) =>
  r.claims.map((c, i) => ({ ...c, lens: r.lens, id: `${r.lens.slice(0, 3).toUpperCase()}-${i + 1}` }))
)

// Merceklerden SIRAYLA al (round-robin). Düz birleştirmede ilk merceğin tamamı
// sınırı doldurup diğer mercekleri tamamen dışarıda bırakıyordu.
let claims = []
const maxLen = Math.max(0, ...perLens.map((x) => x.length))
for (let i = 0; i < maxLen; i++) {
  for (const lensClaims of perLens) {
    if (lensClaims[i]) claims.push(lensClaims[i])
  }
}

if (!claims.length) {
  log('Aday iddia yok — envanter doluydu ama mercekler bulgu üretmedi.')
  return { gate: 'PASS_WITH_NOTES', claims: [], inventoryCounts: { docs: (inv.docs || []).length } }
}

const judged = claims.slice(0, maxClaims)
const dropped = claims.slice(maxClaims)
if (dropped.length) {
  log(
    `DIKKAT: ${dropped.length} iddia maxClaims=${maxClaims} sınırı nedeniyle yargılanmadı: ` +
      dropped.map((c) => `${c.id} (${c.kind})`).join(', ')
  )
}
log(`Konsey: ${judged.length} tasarım iddiası yargılanıyor.`)

// ---- Alinti dogrulama + yaricap (paralel) -------------------------------
const [refutations, gate] = await parallel([
  () =>
    parallel(
      judged.map((c) => () =>
        agent(
          'Aşağıdaki TASARIM iddiasını çürütmeye çalış (lane: design). Birincil yol ALINTI DOĞRULAMA: ' +
            'alıntının işaret ettiği yeri OKU; iddia edileni söylemiyorsa iddia düşer. ' +
            'Sonucu olmayan tercih beyanı da düşer. Şüphedeysen refuted=true.\n\n' +
            JSON.stringify({ workspace: target, id: c.id, kind: c.kind, summary: c.summary, citation: c.citation, consequence: c.consequence }),
          { label: `refute:${c.id}`, phase: 'Alinti', schema: REFUTE_SCHEMA, agentType: 'council-refuter' }
        ).then((r) => ({ claim: c, refute: r }))
      )
    ),
  () =>
    agent(
      `Hedef: ${target}\n\n` +
        'Aşağıdaki tasarım iddialarını geri alınabilirlik açısından yargıla. Bunlar reprodüce ' +
        'EDİLEMEZ; ampirik veto geçmez, kapı sensin.\n' +
        '- Somut izlenebilir sonuç yoksa → rejected\n' +
        '- Sonuç var, geri dönülebilir → advisory\n' +
        '- Sonuç var + TEK YÖNLÜ KAPI → blocking, `one_way_door` alanını DOLDUR ' +
        '(veri kaybı, yayınlanmış sözleşme, geri alınamaz şema/karar, dışarı gitmiş taahhüt). ' +
        'Alanı boş bırakırsan karar kuralı advisory\'ye düşürür.\n' +
        '- Fix maliyeti TAHMİN ETME.\n\n' +
        JSON.stringify(judged),
      { label: 'one-way-doors', phase: 'Yaricap', schema: GATE_SCHEMA, agentType: 'council-blast-radius' }
    ),
])

// ---- Karar kurali: kodda -----------------------------------------------
const gv = (gate && gate.verdicts) || []
const verdicts = (refutations || []).filter(Boolean).map((r) => {
  const c = r.claim
  const ref = r.refute
  const g = gv.find((x) => x.claim_id === c.id)

  let status
  let downgraded = null
  if (!ref) status = 'unproven'
  else if (ref.unresolved) status = 'unproven'
  else if (ref.refuted) status = 'killed'
  else {
    status = g ? g.verdict : 'advisory'
    if (status === 'blocking' && !(g && g.one_way_door)) {
      status = 'advisory'
      downgraded = 'tek yönlü kapı adlandırılmadı'
    }
  }

  return {
    claim_id: c.id,
    kind: c.kind,
    status,
    downgraded,
    refutation_kind: ref ? ref.refutation_kind : null,
    confidence: ref ? ref.confidence : null,
    one_way_door: g ? g.one_way_door : null,
    trajectory: g ? g.trajectory : null,
    summary: c.summary,
    citation: c.citation,
    consequence: c.consequence,
  }
})

const blocking = verdicts.filter((v) => v.status === 'blocking')
const killed = verdicts.filter((v) => v.status === 'killed')
const finalGate = blocking.length ? 'BLOCK' : 'PASS_WITH_NOTES'
log(`Karar: ${finalGate} — ${blocking.length} tek yönlü kapı, ${killed.length} iddia çürütüldü.`)

phase('Karar')
const report = await agent(
  'Tasarım konseyi çıktılarını sentezle. Karar kuralı SCRIPT tarafından uygulandı — ' +
    'statüleri DEĞİŞTİRME, raporla ve gerekçelendir.\n\n' +
    `GATE: ${finalGate}\n` +
    `Envanter özeti: ${JSON.stringify({ docs: (inv.docs || []).length, modules: (inv.modules || []).length, decisions: (inv.decisions || []).length, sampling: inv.sampling || null })}\n` +
    `Kararlar: ${JSON.stringify(verdicts)}\n` +
    (dropped.length ? `YARGILANMAYAN: ${JSON.stringify(dropped)} — raporda AÇIKÇA belirt.\n` : '') +
    '\nBu lane\'de ampirik kanıt YOK, dolayısıyla oy telemetrisi (flip) uygulanmaz — ' +
    'council-votes.jsonl\'e YAZMA. Bunun yerine: çürütülen iddiaları `refutation_kind` ile ' +
    'birlikte listele (hangi mimari eleştiri neden gürültüydü — bu en öğretici kısım), ' +
    've azınlık görüşünü yuvarlamadan aktar.',
  { label: 'chair', phase: 'Karar', agentType: 'council-chair' }
)

return {
  gate: finalGate,
  blocking: blocking.length,
  killed: killed.length,
  judged: verdicts.length,
  unjudged: dropped.map((c) => c.id),
  inventory: { docs: (inv.docs || []).length, modules: (inv.modules || []).length, decisions: (inv.decisions || []).length, sampling: inv.sampling || null },
  verdicts,
  report,
}
