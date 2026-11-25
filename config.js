// Configuração do app Oasis Mind.
// Deixe supabaseUrl vazio para rodar em MODO DEMONSTRAÇÃO (tudo salvo só no aparelho, respostas da IA simuladas).
window.APP_CONFIG = {
  nome: 'Oasis Mind',
  dominio: 'oasismind.app',

  // Supabase (Settings > API). Nunca coloque aqui a service_role key.
  supabaseUrl: '',
  supabaseAnonKey: '',

  // Notificações push (gere com: npx web-push generate-vapid-keys)
  vapidPublicKey: '',

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
