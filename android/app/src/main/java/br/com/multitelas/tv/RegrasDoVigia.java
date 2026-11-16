package br.com.multitelas.tv;

/*
 * As regras do vigia do app, sem nada do Android (o teste do repositório
 * compila e roda esta classe sozinha: test/app-contra-travamento.test.js).
 *
 * O vigia (MainActivity) pergunta à página a cada minuto. A resposta vira:
 *
 *   OK       o player está de pé e andando;
 *   FORA     o JavaScript respondeu, mas não é o player (página em branco,
 *            página de erro, aparelho antigo demais). Recarregar resolve;
 *            recriar o WebView não ajudaria, então não sobe a escada;
 *   PARADO   o player responde, o servidor também, e uma zona está parada há
 *            mais de 15 min apesar do vigia da página (js/vigia.js);
 *   SILENCIO a pergunta anterior não voltou em um minuto: o JavaScript ou o
 *            processo do WebView travou. É o caso que o vigia de antes não
 *            via — ele só contava o "não", e o travado não responde nada.
 *
 * Nada acontece por uma falha só: são 3 seguidas (3 min) antes de cada ação,
 * e cada ação zera a conta. PARADO e SILENCIO sobem uma escada:
 *
 *   1. recarregar a página;
 *   2. recriar o WebView (no Android 10+, matando o processo travado dele);
 *      — no Android até 9, com SILENCIO, reiniciar o app em vez disso: lá o
 *      renderizador travado não morre sozinho, e um WebView novo nasceria no
 *      mesmo processo travado. No máximo uma vez a cada 6 h (a marca fica
 *      guardada, porque o app reiniciado esquece tudo o que está aqui);
 *   3. dali em diante, recriar de novo no máximo a cada 30 min.
 *
 * 30 min sem falha e a escada volta ao começo. Com outra tela por cima (as
 * configurações, o instalador), só recarrega: ninguém está vendo a TV, e
 * pode haver alguém mexendo no aparelho.
 */
final class RegrasDoVigia {

    static final int OK = 0;
    static final int FORA = 1;
    static final int PARADO = 2;
    static final int SILENCIO = 3;

    static final int NADA = 0;
    static final int RECARREGAR = 1;
    static final int RECRIAR = 2;
    static final int REINICIAR_APP = 3;

    static final int FALHAS_PARA_AGIR = 3;
    static final long ESTAVEL_MS = 30 * 60_000L;
    static final long ENTRE_ACOES_NO_TOPO_MS = 30 * 60_000L;
    static final long ENTRE_REINICIOS_DO_APP_MS = 6 * 60 * 60_000L;
    // O pedido da página (painel, madrugada): no máximo um a cada 5 min.
    static final long ENTRE_PEDIDOS_MS = 5 * 60_000L;
    /*
     * O processo do WebView caiu sozinho (memória, quase sempre) e já tinha
     * caído 3 vezes nos últimos 10 min: a recarga espera 1 min, para o
     * aparelho respirar e a TV não martelar o servidor a cada poucos segundos.
     */
    static final int QUEDAS_SEGUIDAS = 3;
    static final long JANELA_DAS_QUEDAS_MS = 10 * 60_000L;
    static final long ESPERA_DEPOIS_DAS_QUEDAS_MS = 60_000L;

    // "Nunca aconteceu", longe o bastante para `agora - NUNCA` não estourar.
    private static final long NUNCA = Long.MIN_VALUE / 4;

    private int falhas = 0;
    private int degrau = 0;
    private long ultimaFalha = NUNCA;
    private long ultimaAcao = NUNCA;
    private long ultimoPedido = NUNCA;
    private final long[] quedas = { NUNCA, NUNCA, NUNCA };
    private int proximaQueda = 0;

    /*
     * Uma resposta da página (ou o silêncio). `agora`: relógio que só anda
     * para a frente (SystemClock.elapsedRealtime). `emFrente`: a tela do app
     * está na frente. `appPodeReiniciar`: Android até 9 e nenhum reinício do
     * app nas últimas 6 h — quem chama confere a marca guardada.
     */
    int anotar(int resposta, long agora, boolean emFrente, boolean appPodeReiniciar) {
        if (resposta == OK) {
            falhas = 0;
            if (degrau > 0 && agora - ultimaFalha >= ESTAVEL_MS) degrau = 0;
            return NADA;
        }
        ultimaFalha = agora;
        if (++falhas < FALHAS_PARA_AGIR) return NADA;
        int acao;
        if (resposta == FORA || degrau == 0) {
            acao = RECARREGAR;
        } else if (!emFrente) {
            return NADA;
        } else if (resposta == SILENCIO && appPodeReiniciar) {
            acao = REINICIAR_APP;
        } else if (degrau == 1 || agora - ultimaAcao >= ENTRE_ACOES_NO_TOPO_MS) {
            acao = RECRIAR;
        } else {
            return NADA;
        }
        falhas = 0;
        ultimaAcao = agora;
        if (resposta != FORA && degrau < 2) degrau++;
        return acao;
    }

    // A página pediu a recriação (comando do painel, recarga da madrugada).
    boolean aceitarPedido(long agora) {
        if (agora - ultimoPedido < ENTRE_PEDIDOS_MS) return false;
        ultimoPedido = agora;
        falhas = 0;
        return true;
    }

    // O processo do WebView caiu sozinho. Devolve quanto esperar antes de carregar a página de novo.
    long esperaDepoisDaQueda(long agora) {
        long maisAntiga = quedas[proximaQueda];
        quedas[proximaQueda] = agora;
        proximaQueda = (proximaQueda + 1) % QUEDAS_SEGUIDAS;
        falhas = 0;
        return agora - maisAntiga < JANELA_DAS_QUEDAS_MS ? ESPERA_DEPOIS_DAS_QUEDAS_MS : 0;
    }

    // O vigia recomeça a contar (página nova carregada, WebView novo).
    void recomecar() {
        falhas = 0;
    }

    int degrau() {
        return degrau;
    }
}
