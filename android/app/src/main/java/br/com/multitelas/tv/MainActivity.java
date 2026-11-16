package br.com.multitelas.tv;

import android.app.Activity;
import android.app.AlarmManager;
import android.app.AlertDialog;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.provider.Settings;
import android.text.InputType;
import android.util.Log;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebViewRenderProcess;
import android.widget.EditText;
import android.widget.FrameLayout;

/*
 * A moldura de quiosque do player.
 *
 * O player é web (o /tv do servidor) e já sabe tudo: parear, exibir, guardar
 * a última programação e funcionar sem internet. O que um TV Box comum não
 * sabe é ser uma TELA: ele dorme, mostra o launcher, fecha o navegador, perde
 * o navegador numa atualização. Este app existe só para isso:
 *
 *   - abrir direto no /tv, em tela cheia, e não sair dali;
 *   - manter a tela acesa;
 *   - se a página travar ou o processo do WebView morrer, voltar sozinho;
 *   - se o app inteiro cair, reabrir.
 *
 * Trocar o servidor: aperte VOLTAR cinco vezes seguidas. Qualquer outro
 * VOLTAR é ignorado — num quiosque, voltar é sair da tela do cliente.
 */
public class MainActivity extends Activity {

    private static final String PREFS = "multitelas";
    private static final String CHAVE_URL = "url";
    // Quando o vigia reiniciou o app pela última vez (relógio de parede): no máximo uma vez a cada 6 h.
    private static final String CHAVE_REINICIO = "vigiaReiniciouEm";
    private static final String CHAVE_REINICIOS = "vigiaReinicios";
    private static final String TAG = "MultiTelas";

    // De quanto em quanto tempo o vigia pergunta ao player se ele está vivo.
    private static final long VIGIA_MS = 60_000;
    // Espera antes de tentar de novo quando a página nem carregou.
    private static final long NOVA_TENTATIVA_MS = 15_000;
    // Zona parada há mais que isto (e o servidor respondendo): o vigia da página já tentou e não resolveu.
    private static final long PARADA_MS = 15 * 60_000L;

    /*
     * A pergunta do vigia (RegrasDoVigia diz o que fazer com a resposta):
     *   "reiniciar:…" a página pediu um WebView novo (window.MT_REINICIAR,
     *                 posto pelo comando do painel ou pela recarga da
     *                 madrugada — js/vigia.js, reiniciarApp);
     *   "fora"        o JavaScript responde, mas o player não subiu;
     *   "parado"      uma zona parada há mais de 15 min, com o servidor de pé;
     *   "ok"          o resto.
     * O pedido é uma marca na página, e não um método da ponte: a ponte
     * (MTApp) é vista por todo iframe, e um site externo num conteúdo poderia
     * reiniciar a TV em laço. A marca só a própria página põe.
     */
    private static final String PERGUNTA = "(function(){try{"
            + "var r=window.MT_REINICIAR;if(r)return 'reiniciar:'+String(r).slice(0,20);"
            + "if(!(window.MTCloud&&document.body))return 'fora';"
            + "var v=window.MTVigia&&window.MTVigia.estado?window.MTVigia.estado():null;"
            + "if(v&&v.parada>" + PARADA_MS + "&&v.pulsoOk&&Date.now()-v.pulsoOk<120000)return 'parado';"
            + "return 'ok';}catch(e){return 'erro';}})()";

    // O que o vigia fez desde que o app abriu (vai no pulso, para o painel e o suporte enxergarem).
    private static volatile String resumo = "";

    /*
     * O que aparece quando nem o player abriu: primeira vez ligado e sem
     * internet (ainda não há cópia guardada). Sem isto, a TV da loja mostrava
     * a página de erro do Android — "Página da Web não disponível", com o
     * endereço do servidor — até a rede voltar. Depois da primeira vez o
     * player sobe do cache e isto não aparece mais.
     */
    private static final String PAGINA_SEM_REDE = "<!doctype html><html><head><meta charset='utf-8'>"
            + "<meta name='viewport' content='width=device-width,initial-scale=1'><style>"
            + "html,body{margin:0;height:100%;background:#0b1020;color:#f2f6ff;font-family:sans-serif}"
            + "body{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}"
            + "h1{font-size:4.2vw;margin:0 0 1.2vw}p{font-size:2vw;color:rgba(226,235,255,.62);margin:0}"
            + "</style></head><body><h1>Procurando a internet…</h1>"
            + "<p>A TV tenta de novo sozinha. Confira o Wi-Fi do aparelho.</p></body></html>";

    private WebView web;
    private FrameLayout raiz;
    private Atualizador atualizador;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final RegrasDoVigia regras = new RegrasDoVigia();
    // A pergunta em curso: resposta de outra (atrasada, de um WebView que já saiu) não conta.
    private int pergunta = 0;
    private boolean esperandoResposta = false;
    // O vigia descansa: a página "Procurando a internet…" está na tela (a nova tentativa de 15 s cuida) ou a recarga está esperando.
    private boolean vigiaEmPausa = false;
    // O WebView foi morto de propósito (recriar): a queda que chega não conta como queda.
    private boolean terminandoDeProposito = false;
    private boolean emFrente = false;
    // O que o vigia fez desde que o app abriu: por falha (recargas, recriações) e a pedido da página.
    private int recargas = 0;
    private int recriacoes = 0;
    private int pedidos = 0;
    private int voltasSeguidas = 0;
    private long ultimaVolta = 0;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        reabrirSeCair();

        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
                | WindowManager.LayoutParams.FLAG_FULLSCREEN
                | WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON);

        pedirSobreposicaoUmaVez();

        raiz = new FrameLayout(this);
        raiz.setBackgroundColor(Color.BLACK);
        setContentView(raiz);
        criarWebView();
        carregar();
        handler.postDelayed(vigia, VIGIA_MS);
        // D41: a moldura confere se há versão nova dela mesma (aviso no canto, OK instala).
        atualizador = new Atualizador(this, raiz);
        atualizador.comecar();
    }

    /* ---------------- WebView ---------------- */

    private void criarWebView() {
        if (web != null) {
            raiz.removeView(web);
            web.destroy();
        }
        web = new WebView(this);
        web.setBackgroundColor(Color.BLACK);
        web.setLayoutParams(new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);          // localStorage: a identidade da tela e a última config
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false); // vídeo e música tocam sem ninguém tocar na TV
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setUserAgentString(s.getUserAgentString() + " MultiTelasTV/" + BuildConfig.VERSION_NAME);

        web.addJavascriptInterface(new Ponte(getApplicationContext()), "MTApp");
        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest req) {
                // Só o próprio servidor abre aqui dentro. Um link qualquer (um
                // conteúdo com URL externa) não pode tirar a TV do player.
                Uri alvo = req.getUrl();
                Uri base = Uri.parse(urlDoServidor());
                return alvo.getHost() == null || !alvo.getHost().equalsIgnoreCase(base.getHost());
            }

            @android.annotation.TargetApi(23)
            @Override
            public void onReceivedError(WebView v, WebResourceRequest req, WebResourceError err) {
                // Só a página principal importa: uma imagem que falhou não é
                // motivo para recarregar a tela inteira.
                if (req.isForMainFrame()) {
                    // Quem cuida daqui é a nova tentativa de 15 s; o vigia não conta esta página como falha.
                    vigiaEmPausa = true;
                    v.loadDataWithBaseURL(null, PAGINA_SEM_REDE, "text/html", "utf-8", null);
                    tentarDeNovoEmBreve();
                }
            }

            @android.annotation.TargetApi(26)
            @Override
            public boolean onRenderProcessGone(WebView v, RenderProcessGoneDetail detail) {
                // O processo do WebView morreu (memória, na maioria das vezes,
                // ou o vigia o matou de propósito para recriar). Sem tratar
                // isto, o app inteiro cai junto. Recria e segue.
                if (v != web) return true; // um WebView que já saiu: o de agora segue
                boolean proposital = terminandoDeProposito;
                terminandoDeProposito = false;
                long espera = proposital ? 0 : regras.esperaDepoisDaQueda(SystemClock.elapsedRealtime());
                Log.w(TAG, "vigia: o processo do WebView " + (proposital ? "foi recriado" : "caiu")
                        + (espera > 0 ? "; carrega de novo em " + (espera / 1000) + " s" : ""));
                criarWebView();
                if (espera > 0) {
                    vigiaEmPausa = true;
                    handler.removeCallbacks(novaTentativa);
                    handler.postDelayed(novaTentativa, espera);
                } else {
                    carregar();
                }
                return true;
            }
        });
        // Sempre por baixo: o aviso de atualização (D41) fica por cima mesmo quando o WebView é recriado.
        raiz.addView(web, 0);
        esconderBarras();
    }

    private void carregar() {
        if (web == null) return; // a tela já fechou
        // Página nova: a pergunta que estava no ar não volta mais, e não é silêncio.
        pergunta++;
        esperandoResposta = false;
        vigiaEmPausa = false;
        regras.recomecar();
        web.loadUrl(urlDoServidor() + "/tv");
    }

    private final Runnable novaTentativa = this::carregar;

    private void tentarDeNovoEmBreve() {
        handler.removeCallbacks(novaTentativa);
        handler.postDelayed(novaTentativa, NOVA_TENTATIVA_MS);
    }

    /*
     * O vigia: a cada minuto pergunta ao player se ele está de pé
     * (PERGUNTA) e, desde o v2, conta também o SILÊNCIO — a pergunta de um
     * minuto atrás que não voltou. O de antes só contava o "não": com o
     * JavaScript travado de verdade a resposta nunca vinha, e ele nunca agia
     * (docs/CAPACIDADE-E-TVBOX.md §6.1). O que fazer com cada resposta, e com
     * que freio, está em RegrasDoVigia. O player guarda a última
     * programação, então recarregar é seguro mesmo sem internet.
     */
    private final Runnable vigia = new Runnable() {
        @Override
        public void run() {
            // Primeiro o próximo: nada aqui pode parar o vigia.
            handler.postDelayed(this, VIGIA_MS);
            if (web == null || vigiaEmPausa) {
                esperandoResposta = false;
                return;
            }
            if (esperandoResposta) {
                esperandoResposta = false;
                if (agir(regras.anotar(RegrasDoVigia.SILENCIO, SystemClock.elapsedRealtime(), emFrente, appPodeReiniciar()),
                        "a página não responde há 1 min")) return;
            }
            final int esta = ++pergunta;
            esperandoResposta = true;
            web.evaluateJavascript(PERGUNTA, valor -> {
                if (esta != pergunta) return;
                esperandoResposta = false;
                responder(valor);
            });
        }
    };

    private void responder(String valor) {
        // O evaluateJavascript devolve o texto em JSON: "\"ok\"".
        String r = valor == null ? "" : valor;
        if (r.length() >= 2 && r.startsWith("\"") && r.endsWith("\"")) r = r.substring(1, r.length() - 1);
        long agora = SystemClock.elapsedRealtime();
        if (r.startsWith("reiniciar")) {
            // Comando do painel ou a recarga da madrugada (js/vigia.js): WebView novo, memória do processo devolvida.
            if (regras.aceitarPedido(agora)) {
                anotarAcao("pedido", "pedido da página (" + r + ")");
                recriar();
            }
            return;
        }
        int resposta = "ok".equals(r) ? RegrasDoVigia.OK
                : "parado".equals(r) ? RegrasDoVigia.PARADO
                : RegrasDoVigia.FORA;
        agir(regras.anotar(resposta, agora, emFrente, appPodeReiniciar()),
                resposta == RegrasDoVigia.PARADO ? "zona parada há mais de 15 min" : "o player não está na página");
    }

    // Faz o que as regras mandaram. Devolve se fez alguma coisa.
    private boolean agir(int acao, String motivo) {
        switch (acao) {
            case RegrasDoVigia.RECARREGAR:
                anotarAcao("recarga", motivo);
                carregar();
                return true;
            case RegrasDoVigia.RECRIAR:
                anotarAcao("recriação", motivo);
                recriar();
                return true;
            case RegrasDoVigia.REINICIAR_APP:
                anotarAcao("reinício do app", motivo);
                reiniciarApp();
                return true;
            default:
                return false;
        }
    }

    private void anotarAcao(String acao, String motivo) {
        if (acao.equals("recarga")) recargas++;
        else if (acao.equals("recriação")) recriacoes++;
        else if (acao.equals("pedido")) pedidos++;
        // "app": quantas vezes o vigia reiniciou o app neste aparelho (guardado; o resto é desta abertura).
        int doApp = getSharedPreferences(PREFS, MODE_PRIVATE).getInt(CHAVE_REINICIOS, 0);
        resumo = "recargas " + recargas + " · webview " + recriacoes + " · pedidos " + pedidos + " · app " + doApp;
        Log.w(TAG, "vigia: " + acao + " — " + motivo + " (degrau " + regras.degrau() + ")");
    }

    /*
     * WebView novo. No Android 10+ mata o processo do WebView (o
     * renderizador): é ele que trava e é ele que segura a memória; o
     * onRenderProcessGone recria o WebView e carrega a página. Antes do 10 não
     * há como matar só o renderizador: troca o WebView.
     */
    private void recriar() {
        if (Build.VERSION.SDK_INT >= 29 && terminarRenderizador()) return;
        criarWebView();
        carregar();
    }

    private boolean terminarRenderizador() {
        terminandoDeProposito = Api29.terminar(web);
        return terminandoDeProposito;
    }

    /*
     * À parte, numa classe que só carrega no Android 10+: o box de Android
     * 5 a 9 nunca encosta em WebViewRenderProcess, nem para conferir a classe.
     */
    @android.annotation.TargetApi(29)
    private static final class Api29 {
        static boolean terminar(WebView w) {
            try {
                WebViewRenderProcess p = w.getWebViewRenderProcess();
                return p != null && p.terminate();
            } catch (RuntimeException naoDeu) {
                return false;
            }
        }
    }

    /*
     * O último degrau, só no Android até 9: lá o renderizador mora no
     * processo do app (até o 7) ou não pode ser morto sozinho (8 e 9), e um
     * WebView novo nasceria no mesmo processo travado. Agenda a reabertura
     * em 2 s — o mesmo alarme de reabrirSeCair, que até o 9 pode abrir a tela
     * do fundo — e sai. A marca é gravada ANTES (commit, não apply): o app que
     * volta travando não reinicia de novo por 6 h.
     */
    @android.annotation.SuppressLint("ApplySharedPref")
    private void reiniciarApp() {
        SharedPreferences p = getSharedPreferences(PREFS, MODE_PRIVATE);
        p.edit().putLong(CHAVE_REINICIO, System.currentTimeMillis())
                .putInt(CHAVE_REINICIOS, p.getInt(CHAVE_REINICIOS, 0) + 1)
                .commit();
        agendarReabertura(getApplicationContext());
        android.os.Process.killProcess(android.os.Process.myPid());
    }

    private boolean appPodeReiniciar() {
        if (Build.VERSION.SDK_INT >= 29) return false;
        long ultimo = getSharedPreferences(PREFS, MODE_PRIVATE).getLong(CHAVE_REINICIO, 0);
        // abs: o relógio de um box barato acerta a hora depois do boot e pode andar para trás.
        return Math.abs(System.currentTimeMillis() - ultimo) >= RegrasDoVigia.ENTRE_REINICIOS_DO_APP_MS;
    }

    // O resumo do vigia para o pulso (Ponte.vigiaResumo): o que ele fez desde que o app abriu.
    static String resumoDoVigia() {
        return resumo;
    }

    /*
     * O app é a TELA INICIAL do aparelho? É a única garantia de voltar depois
     * de uma queda que não passa por aqui: o app morto por falta de memória,
     * a queda nativa e a atualização do Android System WebView (que mata o
     * app). O Android reabre a tela inicial sozinho; qualquer outro app fica
     * fechado até alguém abrir. O painel avisa na página da TV.
     */
    @SuppressWarnings("deprecation")
    static boolean ehTelaInicial(Context ctx) {
        try {
            Intent home = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME);
            ResolveInfo r = ctx.getPackageManager().resolveActivity(home, PackageManager.MATCH_DEFAULT_ONLY);
            return r != null && r.activityInfo != null && ctx.getPackageName().equals(r.activityInfo.packageName);
        } catch (RuntimeException semResposta) {
            return false;
        }
    }

    /* ---------------- Tela cheia e teclas ---------------- */

    private void esconderBarras() {
        View d = getWindow().getDecorView();
        d.setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                | View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) esconderBarras();
    }

    /*
     * Com a atualização pronta (o aviso no canto), o OK do controle instala.
     * Sem ela, o OK segue para o player como sempre.
     */
    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        int k = event.getKeyCode();
        if (atualizador != null && atualizador.temPronto()
                && (k == KeyEvent.KEYCODE_DPAD_CENTER || k == KeyEvent.KEYCODE_ENTER || k == KeyEvent.KEYCODE_NUMPAD_ENTER)) {
            if (event.getAction() == KeyEvent.ACTION_UP) atualizador.instalar();
            return true;
        }
        return super.dispatchKeyEvent(event);
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            long agora = SystemClock.uptimeMillis();
            voltasSeguidas = (agora - ultimaVolta < 1500) ? voltasSeguidas + 1 : 1;
            ultimaVolta = agora;
            if (voltasSeguidas >= 5) {
                voltasSeguidas = 0;
                pedirServidor();
            }
            return true; // quiosque: VOLTAR não sai da tela
        }
        return super.onKeyDown(keyCode, event);
    }

    /* ---------------- Servidor ---------------- */

    String urlDoServidor() {
        SharedPreferences p = getSharedPreferences(PREFS, MODE_PRIVATE);
        String url = p.getString(CHAVE_URL, BuildConfig.MT_URL);
        return url.replaceAll("/+$", "");
    }

    private void pedirServidor() {
        final EditText campo = new EditText(this);
        campo.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        campo.setText(urlDoServidor());
        new AlertDialog.Builder(this)
                .setTitle("Endereço do MultiTelas")
                .setMessage("Normalmente não precisa mudar. Ex.: https://tv.multitelas.net.br")
                .setView(campo)
                .setPositiveButton("Salvar", (d, w) -> {
                    String url = campo.getText().toString().trim();
                    if (url.startsWith("https://") || url.startsWith("http://")) {
                        getSharedPreferences(PREFS, MODE_PRIVATE).edit().putString(CHAVE_URL, url).apply();
                        carregar();
                    }
                })
                .setNeutralButton("Padrão", (d, w) -> {
                    getSharedPreferences(PREFS, MODE_PRIVATE).edit().remove(CHAVE_URL).apply();
                    carregar();
                })
                .setNegativeButton("Cancelar", null)
                .show();
    }

    /*
     * No Android 10+ o receiver de boot não consegue abrir a tela — a menos que
     * o app seja a tela inicial ou tenha "sobrepor a outros apps". Pede essa
     * permissão UMA vez (na primeira abertura, com o instalador na frente da
     * TV). Aparelho sem essa tela de configuração: segue sem, e o caminho é
     * definir o app como tela inicial (android/README.md).
     */
    private void pedirSobreposicaoUmaVez() {
        if (Build.VERSION.SDK_INT < 23 || Settings.canDrawOverlays(this)) return;
        SharedPreferences p = getSharedPreferences(PREFS, MODE_PRIVATE);
        if (p.getBoolean("pediuSobreposicao", false)) return;
        p.edit().putBoolean("pediuSobreposicao", true).apply();
        try {
            startActivity(new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:" + getPackageName())));
        } catch (RuntimeException semTela) {
            // Muitas TVs não têm essa tela; sem problema.
        }
    }

    /* ---------------- Se o app cair ---------------- */

    /*
     * Exceção não tratada derruba o app e a TV fica no launcher do aparelho —
     * a pior tela possível na parede de um cliente. Agenda a reabertura para
     * dois segundos depois e deixa o processo morrer.
     */
    private void reabrirSeCair() {
        final Context ctx = getApplicationContext();
        final Thread.UncaughtExceptionHandler anterior = Thread.getDefaultUncaughtExceptionHandler();
        Thread.setDefaultUncaughtExceptionHandler((t, e) -> {
            agendarReabertura(ctx);
            if (anterior != null) anterior.uncaughtException(t, e);
            else System.exit(2);
        });
    }

    // Reabre o app em 2 s (alarme). Usado quando ele cai e quando o vigia o reinicia.
    static void agendarReabertura(Context ctx) {
        try {
            Intent i = new Intent(ctx, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            int flags = PendingIntent.FLAG_ONE_SHOT
                    | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0);
            PendingIntent pi = PendingIntent.getActivity(ctx, 0, i, flags);
            AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
            if (am != null) am.set(AlarmManager.RTC, System.currentTimeMillis() + 2000, pi);
        } catch (Throwable ignorada) {
            // Reabrir é melhor esforço; o que não pode é cair tentando.
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        emFrente = true;
        esconderBarras();
        if (web != null) web.onResume();
    }

    @Override
    protected void onPause() {
        // Não pausa o WebView: a TV continua exibindo mesmo se um diálogo do
        // sistema aparecer por cima. Só o vigia fica mais contido (RegrasDoVigia).
        emFrente = false;
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        if (atualizador != null) atualizador.parar();
        // Resposta ou queda que ainda chegue não mexe num WebView destruído.
        pergunta++;
        if (web != null) web.destroy();
        web = null;
        super.onDestroy();
    }
}
