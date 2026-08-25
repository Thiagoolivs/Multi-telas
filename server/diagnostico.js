/*
 * server/diagnostico.js — o que está configurado, e o que vai doer.
 *
 * Isto existe porque os avisos deste sistema moravam todos em `console.warn`
 * no boot, num lugar onde o cliente nunca olha e o dono raramente. O pior
 * deles — mídia gravando em disco efêmero — é silencioso por natureza: tudo
 * funciona no dia do deploy e a arte some no deploy seguinte. Quando o
 * problema aparece, aparece na parede.
 *
 * Cada verificação responde três coisas, nesta ordem, porque é a ordem em que
 * alguém precisa delas:
 *
 *   o que está acontecendo   (`estado`)
 *   o que isso causa         (`consequencia`)
 *   o que fazer              (`resolver`)
 *
 * Níveis:
 *   'critico'  já está causando perda, ou vai causar sem aviso
 *   'atencao'  parte do produto não funciona, mas nada se perde
 *   'ok'       configurado
 *
 * Funções puras sobre um objeto de ambiente: dá para testar cada cenário sem
 * subir servidor nem mexer em process.env.
 */

const PAAS_VARS = ['RAILWAY_ENVIRONMENT', 'DYNO', 'RENDER'];

function naNuvem(env) {
  return PAAS_VARS.some((v) => !!env[v]);
}

/* ---------------- Verificações ---------------- */

/*
 * A mais importante das seis, e a única que destrói trabalho já feito.
 */
function armazenamento(env) {
  const driver = String(env.STORAGE || 'disk').toLowerCase();
  if (driver === 's3') {
    const faltando = ['S3_ENDPOINT', 'S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'].filter((k) => !env[k]);
    if (faltando.length) {
      return {
        id: 'armazenamento', nivel: 'critico', titulo: 'Armazenamento de mídia',
        estado: 'STORAGE=s3 sem as chaves: falta ' + faltando.join(', ') + '.',
        consequencia: 'O servidor nem sobe assim. Nenhuma tela fica no ar.',
        resolver: 'Preencha as quatro variáveis do bucket, ou volte para STORAGE=disk com um volume montado.',
      };
    }
    return {
      id: 'armazenamento', nivel: 'ok', titulo: 'Armazenamento de mídia',
      estado: 'Bucket S3/R2 em ' + env.S3_BUCKET + '.',
      consequencia: 'A mídia sobrevive a deploy, a reinício e a troca de máquina.',
      resolver: '',
    };
  }
  const temVolume = !!(env.MEDIA_DIR || env.RAILWAY_VOLUME_MOUNT_PATH);
  if (naNuvem(env) && !temVolume) {
    return {
      id: 'armazenamento', nivel: 'critico', titulo: 'Armazenamento de mídia',
      estado: 'Gravando em disco efêmero: não há bucket nem volume montado.',
      consequencia: 'TODA imagem, vídeo e áudio enviados somem no próximo deploy. '
        + 'Nada avisa: a tela simplesmente fica vazia depois de uma atualização.',
      resolver: 'Use STORAGE=s3 com um bucket Cloudflare R2 (sem custo de saída), '
        + 'ou monte um volume no Railway e aponte MEDIA_DIR para ele.',
    };
  }
  if (temVolume) {
    return {
      id: 'armazenamento', nivel: 'ok', titulo: 'Armazenamento de mídia',
      estado: 'Volume persistente montado.',
      consequencia: 'A mídia sobrevive a deploy. Não sobrevive a trocar de máquina.',
      resolver: '',
    };
  }
  return {
    id: 'armazenamento', nivel: 'ok', titulo: 'Armazenamento de mídia',
    estado: 'Disco local (máquina de desenvolvimento).',
    consequencia: 'Serve para desenvolver. Em produção, precisa de bucket ou volume.',
    resolver: '',
  };
}

function banco(env) {
  if (env.DATABASE_URL) {
    return {
      id: 'banco', nivel: 'ok', titulo: 'Banco de dados',
      estado: 'PostgreSQL.',
      consequencia: 'Os dados sobrevivem a deploy e aguentam mais de uma instância.',
      resolver: '',
    };
  }
  const temVolume = !!(env.MEDIA_DIR || env.RAILWAY_VOLUME_MOUNT_PATH);
  if (naNuvem(env)) {
    return {
      id: 'banco', nivel: temVolume ? 'atencao' : 'critico', titulo: 'Banco de dados',
      estado: 'SQLite em arquivo' + (temVolume ? ', dentro do volume.' : ', em disco efêmero.'),
      consequencia: temVolume
        ? 'Funciona com UMA instância. Com duas, cada uma teria o seu banco.'
        : 'Contas, telas e conteúdos somem no próximo deploy.',
      resolver: 'Defina DATABASE_URL apontando para um PostgreSQL.',
    };
  }
  return {
    id: 'banco', nivel: 'ok', titulo: 'Banco de dados',
    estado: 'SQLite (máquina de desenvolvimento).',
    consequencia: 'Serve para desenvolver.',
    resolver: '',
  };
}

function ia(env) {
  const forcado = String(env.AI_PROVIDER || '').toLowerCase();
  const chave = env.GEMINI_API_KEY || env.GOOGLE_API_KEY || env.GROQ_API_KEY || env.ANTHROPIC_API_KEY;
  if (forcado === 'dev' || (!forcado && !chave)) {
    return {
      id: 'ia', nivel: 'atencao', titulo: 'Inteligência artificial',
      estado: 'Sem chave: rodando em modo de demonstração.',
      consequencia: 'Criar campanha e gerar imagem devolvem exemplo, não arte de verdade. '
        + 'O editor, as telas e a publicação continuam inteiros.',
      resolver: 'Defina GEMINI_API_KEY.',
    };
  }
  return {
    id: 'ia', nivel: 'ok', titulo: 'Inteligência artificial',
    estado: 'Provedor ativo: ' + (forcado || (env.GEMINI_API_KEY || env.GOOGLE_API_KEY ? 'gemini' : env.GROQ_API_KEY ? 'groq' : 'anthropic')) + '.',
    consequencia: 'Campanha e imagem por IA funcionando.',
    resolver: '',
  };
}

function email(env) {
  const forcado = String(env.MAIL_PROVIDER || '').toLowerCase();
  const temChave = !!(env.RESEND_API_KEY || env.BREVO_API_KEY);
  if (forcado === 'dev' || (!forcado && !temChave)) {
    /*
     * Isto era 'atenção' e virou CRÍTICO quando o cadastro passou a exigir
     * confirmação por e-mail: antes se perdia a recuperação de senha, agora
     * se perde a porta de entrada inteira. A pessoa se cadastra, vê "confira
     * seu e-mail", e o e-mail está no log do servidor.
     *
     * SKIP_VERIFY=1 é a saída deliberada: o cadastro volta a criar a conta na
     * hora. Continua sendo problema — sem e-mail não há convite de equipe nem
     * recuperação de senha —, mas deixa de trancar a porta.
     */
    const semVerificacao = String(env.SKIP_VERIFY || '') === '1';
    return {
      id: 'email', nivel: semVerificacao ? 'atencao' : 'critico', titulo: 'Envio de e-mail',
      estado: 'Sem provedor: o e-mail é escrito no log do servidor.',
      consequencia: semVerificacao
        ? 'Com SKIP_VERIFY=1 o cadastro funciona, mas ninguém recupera senha nem aceita '
          + 'convite de equipe — e a conta nasce com um e-mail que nunca foi confirmado.'
        : 'NINGUÉM CONSEGUE SE CADASTRAR: a conta só nasce quando a pessoa clica no link '
          + 'de confirmação, e o link só existe neste log. A tela diz "confira seu e-mail" '
          + 'e não há e-mail.',
      resolver: 'Defina RESEND_API_KEY (ou BREVO_API_KEY) e MAIL_FROM com um endereço do '
        + 'domínio verificado no provedor. Para subir sem provedor, SKIP_VERIFY=1.',
    };
  }
  if (!env.MAIL_FROM) {
    return {
      id: 'email', nivel: 'atencao', titulo: 'Envio de e-mail',
      estado: 'Provedor configurado, mas sem MAIL_FROM.',
      consequencia: 'O provedor recusa a mensagem por falta de remetente.',
      resolver: 'Defina MAIL_FROM com um endereço do domínio verificado.',
    };
  }
  return {
    id: 'email', nivel: 'ok', titulo: 'Envio de e-mail',
    estado: 'Enviando por ' + (forcado || (env.RESEND_API_KEY ? 'resend' : 'brevo')) + '.',
    consequencia: 'Recuperação de senha e convites funcionando.',
    resolver: '',
  };
}

/*
 * Cobrança. Não existia verificação nenhuma aqui.
 *
 * O diagnóstico cobria armazenamento, banco, IA, e-mail, endereço e jurídico
 * — e pulava o dinheiro, que é a parte que só falha depois que alguém tentou
 * pagar. Sem chave, o checkout roda em modo SIMULADO: a página diz "pagamento
 * de teste" e ativa o plano de graça. É ótimo para desenvolver e é ruína em
 * produção, porque parece que funcionou.
 */
function pagamento(env) {
  const chave = String(env.ASAAS_API_KEY || '');
  const token = String(env.ASAAS_WEBHOOK_TOKEN || '');
  const sandbox = String(env.ASAAS_AMBIENTE || '').toLowerCase() === 'sandbox';

  if (!chave) {
    return {
      id: 'pagamento', nivel: 'critico', titulo: 'Cobrança',
      estado: 'Sem ASAAS_API_KEY: o checkout está em modo simulado.',
      consequencia: 'Quem clicar em assinar recebe uma página de "pagamento de teste" e '
        + 'ganha o plano pago sem pagar nada.',
      resolver: 'Defina ASAAS_API_KEY com a chave da sua conta Asaas.',
    };
  }
  if (!token) {
    return {
      id: 'pagamento', nivel: 'critico', titulo: 'Cobrança',
      estado: 'Chave do Asaas definida, mas sem ASAAS_WEBHOOK_TOKEN.',
      consequencia: 'O cliente paga e o plano NUNCA é liberado: o aviso de pagamento chega '
        + 'e é recusado por falta do token. Dinheiro entra, produto não.',
      resolver: 'Defina ASAAS_WEBHOOK_TOKEN com o mesmo valor cadastrado no webhook do Asaas.',
    };
  }
  if (sandbox) {
    return {
      id: 'pagamento', nivel: 'atencao', titulo: 'Cobrança',
      estado: 'Apontando para a SANDBOX do Asaas.',
      consequencia: 'Nenhuma cobrança é real. Serve para testar, não para vender.',
      resolver: 'Remova ASAAS_AMBIENTE para cobrar de verdade.',
    };
  }
  return {
    id: 'pagamento', nivel: 'ok', titulo: 'Cobrança',
    estado: 'Asaas configurado em produção.',
    consequencia: 'Assinaturas são cobradas e o plano é liberado quando o pagamento entra.',
    resolver: '',
  };
}

function endereco(env) {
  const url = env.APP_URL || '';
  if (!url) {
    return {
      id: 'endereco', nivel: 'atencao', titulo: 'Endereço do sistema',
      estado: 'APP_URL não definido.',
      consequencia: 'Os links de convite e de recuperação de senha saem apontando para lugar nenhum.',
      resolver: 'Defina APP_URL com o endereço público, incluindo https://.',
    };
  }
  if (!/^https:\/\//i.test(url)) {
    return {
      id: 'endereco', nivel: 'atencao', titulo: 'Endereço do sistema',
      estado: 'APP_URL sem https.',
      consequencia: 'Sessão sem cookie seguro, e navegador reclamando na tela do cliente.',
      resolver: 'Use https:// em APP_URL.',
    };
  }
  return {
    id: 'endereco', nivel: 'ok', titulo: 'Endereço do sistema', estado: url,
    consequencia: 'Links de e-mail e pareamento de tela apontando para o lugar certo.',
    resolver: '',
  };
}

function juridico(env) {
  if (env.LEGAL_REVISADO !== 'true') {
    return {
      id: 'juridico', nivel: 'atencao', titulo: 'Termos e Privacidade',
      estado: 'Os textos ainda não passaram por revisão jurídica.',
      consequencia: 'As páginas exibem um aviso de que são um rascunho — e o cliente vê esse aviso '
        + 'na hora de aceitar, que é o pior momento para ele desconfiar.',
      resolver: 'Depois da revisão de um advogado, defina LEGAL_REVISADO=true.',
    };
  }
  if (!env.SUPPORT_EMAIL) {
    return {
      id: 'juridico', nivel: 'atencao', titulo: 'Termos e Privacidade',
      estado: 'Revisados, mas sem endereço de contato próprio.',
      consequencia: 'O contato do encarregado de dados sai com um endereço pessoal.',
      resolver: 'Defina SUPPORT_EMAIL.',
    };
  }
  return {
    id: 'juridico', nivel: 'ok', titulo: 'Termos e Privacidade',
    estado: 'Revisados, com contato em ' + env.SUPPORT_EMAIL + '.',
    consequencia: 'Aceite registrado com valor legal.',
    resolver: '',
  };
}

const VERIFICACOES = [armazenamento, banco, ia, email, pagamento, endereco, juridico];

/*
 * Ordem: o que dói primeiro aparece primeiro. Quem abre esta tela quer saber
 * o que consertar agora, não ler uma lista alfabética.
 */
const PESO = { critico: 0, atencao: 1, ok: 2 };

function diagnosticar(env) {
  const itens = VERIFICACOES.map((f) => f(env || {}));
  itens.sort((a, b) => PESO[a.nivel] - PESO[b.nivel]);
  const criticos = itens.filter((i) => i.nivel === 'critico').length;
  const atencoes = itens.filter((i) => i.nivel === 'atencao').length;
  return {
    itens,
    criticos,
    atencoes,
    // Uma frase para o alto da tela, escrita para quem não vai ler o resto.
    resumo: criticos
      ? (criticos === 1 ? '1 problema pode fazer você perder trabalho já feito.' : criticos + ' problemas podem fazer você perder trabalho já feito.')
      : atencoes
        ? (atencoes === 1 ? '1 parte do sistema ainda não está configurada.' : atencoes + ' partes do sistema ainda não estão configuradas.')
        : 'Tudo configurado.',
    nivel: criticos ? 'critico' : atencoes ? 'atencao' : 'ok',
  };
}

module.exports = { diagnosticar, armazenamento, banco, ia, email, pagamento, endereco, juridico, naNuvem };
