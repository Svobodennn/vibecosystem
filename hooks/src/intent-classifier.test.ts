/**
 * Plan direktifi kapisinin davranis kilidi.
 *
 * Bu kapi bir kez yanlis yazildi: `task_type === 'planning'` ile AND'lenmisti ve
 * gercek plan isteklerinin cogunu sessizce dusurdu. Sebep iki AYRI dedektorun
 * AND'lenmesiydi -- task_type detectTask'tan (/\bplan\b/, "planla"yi kacirir ve
 * "build/implement" 0.9 ile "plan" 0.85'i yener), agent_hint detectPlannerAgent'tan
 * (/plan\w*​/, ekleri yakalar). Asagidaki vakalar o turda ampirik olarak olculmus
 * gercek prompt sekilleridir -- bir daha sessizce gerilemesinler diye sabitlendi.
 */
import { describe, it, expect } from 'vitest';
import { classifyIntent, detectPlannerAgent, planDirectiveAgent } from './intent-classifier.js';

const directiveFor = (prompt: string): string | null =>
  planDirectiveAgent(classifyIntent({ session_id: 'test', prompt }));

describe('planDirectiveAgent — plan uretme istekleri direktif alir', () => {
  // task_type ile AND'lendiginde bu dortlunun UCU dusuyordu.
  it.each([
    ['planı yaz', 'planner'],
    ['yeni bir notification feature planla', 'planner'],
    ['write a planning document for the auth flow', 'planner'],
    ['build a plan for the new dashboard module', 'planner'],
    ['bu iş için bir roadmap çıkar', 'planner'],
  ])('%s -> @%s', (prompt, agent) => {
    expect(directiveFor(prompt)).toBe(agent);
  });

  it('refactor planlamasi phoenix aliyor', () => {
    expect(directiveFor('refactor planı çıkar')).toBe('phoenix');
    expect(directiveFor('migration planı hazırla')).toBe('phoenix');
  });
});

describe('planDirectiveAgent — salt-okuma / soru prompt\'lari direktif ALMAZ', () => {
  // Zorunlu direktif ("INLINE PLAN YAZMA, agent spawn et, dosya yaz") mevcut
  // plandan sadece BAHSEDEN prompt'ta yanlis emir olur.
  it.each([
    'planı okudum, teşekkürler',
    'bu planı bana açıkla',
    'what is the plan for auth?',
    'plan nerede duruyor?',
    'dünkü planı özetle',
    'planı göster',
  ])('%s -> direktif yok', (prompt) => {
    expect(directiveFor(prompt)).toBeNull();
  });
});

describe('planDirectiveAgent — komsu dallari calmiyor', () => {
  it('plan review plan-reviewer\'a gider, direktif almaz (dosya uretmez)', () => {
    expect(detectPlannerAgent('planı incele')).toBe('plan-reviewer');
    expect(directiveFor('planı incele')).toBeNull();
  });

  it('architect direktif almaz (ADR yazar, docs/plans/ degil)', () => {
    expect(detectPlannerAgent('microservice architecture tasarla')).toBe('architect');
    expect(directiveFor('microservice architecture tasarla')).toBeNull();
  });

  it('plani UYGULA istegi planlama degil', () => {
    expect(detectPlannerAgent('planı uygula')).toBeNull();
    expect(directiveFor('planı uygula')).toBeNull();
  });

  it('plan ile ilgisi olmayan prompt sessiz', () => {
    expect(directiveFor('bu satırdaki typoyu düzelt')).toBeNull();
  });

  it('maestro tetiklenirse plan direktifi susar', () => {
    expect(planDirectiveAgent({
      ts: '', session_id: 'test', task_type: 'planning', confidence: 1,
      domain: [], skills_needed: [], agent_hint: 'planner',
      complexity: 5, complexity_signals: [], needs_maestro: true,
      is_pure_question: false,
    })).toBeNull();
  });
});

describe('is_pure_question intent\'e tasiniyor', () => {
  // main() disindaki dallar bu bayraga muhtac; ClassifiedIntent'te olmadan
  // isPureQuestion classifyIntent icinde kilitli kaliyordu.
  it('soru isaretli sorgu isaretlenir', () => {
    expect(classifyIntent({ session_id: 'test', prompt: 'what is the plan for auth?' }).is_pure_question).toBe(true);
  });

  it('emir kipi isaretlenmez', () => {
    expect(classifyIntent({ session_id: 'test', prompt: 'planı yaz' }).is_pure_question).toBe(false);
  });
});

describe('TESTING_POLICY.md olan projede tdd-guide onerilmez', () => {
  const prompt = 'add a test';

  it('politika yokken davranis ayni: tdd-guide', () => {
    expect(classifyIntent({ session_id: 'test', prompt }).agent_hint).toBe('tdd-guide');
  });

  it('politika varken ipucu yok', () => {
    expect(classifyIntent({ session_id: 'test', prompt }, { testingPolicy: true }).agent_hint).toBeNull();
  });

  it('politika varken sonraki ipucuna duser', () => {
    const intent = classifyIntent({ session_id: 'test', prompt: 'add a test for the deploy script' }, { testingPolicy: true });
    expect(intent.agent_hint).toBe('devops');
  });

  it('politika diger ipuclarini etkilemez', () => {
    expect(classifyIntent({ session_id: 'test', prompt: 'fix this bug' }, { testingPolicy: true }).agent_hint).toBe('sleuth');
  });
});
