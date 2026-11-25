// Configuração do app Oasis Mind.
// Deixe supabaseUrl vazio para rodar em MODO DEMONSTRAÇÃO (tudo salvo só no aparelho, respostas da IA simuladas).
window.APP_CONFIG = {
  nome: 'Oasis Mind',
  dominio: 'oasismind.vercel.app',

  // Supabase (Settings > API). Nunca coloque aqui a service_role key.
  supabaseUrl: 'https://cqbwfzzsnqwpzhkjiewg.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNxYndmenpzbnF3cHpoa2ppZXdnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTU2MzI2NDcsImV4cCI6MjExMTIwODY0N30.qoV1YbB5BE0AGAWPSroQ0H3rvWOj-1KAoZfB5FrrkMU',

  // Notificações push (gere com: npx web-push generate-vapid-keys)
  vapidPublicKey: 'BD2J98SkD46TYbep5zwVvaFYFG1-YqP3lDyFpy4t25wTvltdG8WOSNs_RufEMS_fHUXqJlbTKsgf6CSZtyRRJ4I',

  // Página de vendas / checkout para quem ainda não tem acesso
  checkout: {
    anual: '',
    mensal: ''
  },
  paginaVendas: 'https://oasismind.com',

  // E-mail de suporte mostrado em Settings
  suporteEmail: 'hello@oasismind.app',

  // Idioma padrão e idiomas que já têm tradução completa em i18n.js
  idiomaPadrao: 'en',
  idiomasAtivos: ['en'],

  // Áudios guiados do SOS (assets/audio/*.mp3). Deixe false até subir os ficheiros.
  audioSOS: false
};
