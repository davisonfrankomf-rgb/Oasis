// Conteúdo fixo do app: perguntas guiadas, dicas científicas e linhas de apoio por país.
// IMPORTANTE: confirme todos os números de apoio antes do lançamento (eles mudam com o tempo).
window.OASIS_DATA = {
  // Perguntas para começar a escrever (uma por dia, em rotação; a pessoa pode trocar)
  journalPrompts: [
    'What\'s taking up the most space in your head right now?',
    'What are you worried about? Write all of it, even the small things.',
    'What do you need to do — and what can wait?',
    'What happened today that you keep thinking about?',
    'What are you carrying that isn\'t yours to carry?',
    'If your body could talk right now, what would it say?',
    'What is one thing you are avoiding — and why?',
    'What went well today, even something small?',
    'What would make tomorrow a little easier?',
    'Which thought keeps coming back? Write it down as it is.',
    'What do you need more of: rest, focus or connection?',
    'What are three things you\'re grateful for today?'
  ],

  // Base científica, mostrada no app (sem promessas clínicas)
  tips: [
    'Writing about stressful thoughts for a few minutes a day (expressive writing) is linked to less rumination and lower stress over time.',
    'Putting a feeling into words (affect labeling) is linked to lower activity in the brain\'s alarm system.',
    'Writing down your open tasks before a break or bedtime frees working memory and can help you switch off.',
    'Noticing three good things from your day is one of the most studied ways to lift mood.',
    'A long, slow exhale activates the body\'s calming response within a few breaths.',
    'Working on one task at a time, in a fixed block, reduces the mental cost of constant switching.',
    'Regular short breaks between focused blocks help protect energy and lower the risk of burnout.'
  ],

  // Palavras ignoradas na nuvem "What's been on your mind"
  stopwords: 'a about after again all also am an and any are as at be because been before being but by can could did do does doing done dont down each even feel felt for from get go going got had has have having he her here him his how i if im in into is it its ive just know like make me more most much my need not now of off on one only or other our out over really so some still than that the their them then there these they thing things think this those to today too up us very was we well were what when which while who why will with would you your yeah ok okay maybe something'.split(' '),

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
