// Conteúdo fixo do app: perguntas guiadas, dicas científicas e linhas de apoio por país.
// IMPORTANTE: confirme todos os números de apoio antes do lançamento (eles mudam com o tempo).
window.OASIS_DATA = {
  // Perguntas da manhã (uma por dia, em rotação)
  morningPrompts: [
    'What\'s taking up the most space in your head right now?',
    'What would make today feel like a good day, even a small one?',
    'What are you carrying into today that isn\'t yours to carry?',
    'If your body could talk this morning, what would it say?',
    'What is one thing you are avoiding — and why?',
    'What do you need more of today: rest, focus or connection?',
    'Which thought keeps coming back? Write it down as it is.'
  ],

  // Dicas curtas, com base em psicologia e neurociência, mostradas depois da resposta da IA
  tips: [
    'Putting a feeling into words (affect labeling) is linked to lower activity in the brain\'s alarm system.',
    'Writing about stressful thoughts for a few minutes (expressive writing) can reduce rumination over time.',
    'A concrete "when–then" plan (implementation intention) makes you much more likely to follow through.',
    'Noticing three good things from your day is one of the most studied ways to lift mood.',
    'A long, slow exhale activates the body\'s calming response within a few breaths.',
    'Treating yourself as you would treat a friend (self-compassion) is linked to more resilience, not less drive.',
    'Asking "what is the evidence for this thought?" is a core tool of cognitive behavioural therapy.'
  ],

  // Linhas de apoio. emergency = número de emergência; lines = apoio emocional / crise.
  // Fonte geral para conferir: https://findahelpline.com
  countries: {
    DE: { name: 'Germany', emergency: '112', lines: [{ name: 'TelefonSeelsorge', phone: '0800 111 0 111' }, { name: 'TelefonSeelsorge', phone: '0800 111 0 222' }] },
    AT: { name: 'Austria', emergency: '112', lines: [{ name: 'TelefonSeelsorge', phone: '142' }] },
    CH: { name: 'Switzerland', emergency: '112', lines: [{ name: 'Die Dargebotene Hand', phone: '143' }] },
    FR: { name: 'France', emergency: '112', lines: [{ name: 'Numéro national de prévention du suicide', phone: '3114' }] },
    BE: { name: 'Belgium', emergency: '112', lines: [] },
    NL: { name: 'Netherlands', emergency: '112', lines: [{ name: '113 Zelfmoordpreventie', phone: '0800 0113' }] },
    LU: { name: 'Luxembourg', emergency: '112', lines: [] },
    ES: { name: 'Spain', emergency: '112', lines: [{ name: 'Línea 024', phone: '024' }] },
    PT: { name: 'Portugal', emergency: '112', lines: [{ name: 'SNS 24 (apoio psicológico)', phone: '808 24 24 24' }] },
    IT: { name: 'Italy', emergency: '112', lines: [{ name: 'Telefono Amico', phone: '02 2327 2327' }] },
    IE: { name: 'Ireland', emergency: '112', lines: [{ name: 'Samaritans', phone: '116 123' }] },
    GB: { name: 'United Kingdom', emergency: '999', lines: [{ name: 'Samaritans', phone: '116 123' }] },
    SE: { name: 'Sweden', emergency: '112', lines: [] },
    DK: { name: 'Denmark', emergency: '112', lines: [] },
    NO: { name: 'Norway', emergency: '112', lines: [] },
    FI: { name: 'Finland', emergency: '112', lines: [] },
    PL: { name: 'Poland', emergency: '112', lines: [] },
    OTHER: { name: 'Other country', emergency: '112', lines: [] }
  }
};
