package br.com.multitelas.tv;

import android.app.Activity;
import android.app.AlarmManager;
import android.app.AlertDialog;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.text.InputType;
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

    // De quanto em quanto tempo o vigia pergunta ao player se ele está vivo.
    private static final long VIGIA_MS = 60_000;
    // Quantas perguntas sem resposta seguidas antes de recarregar.
    private static final int FALHAS_PARA_RECARREGAR = 3;
    // Espera antes de tentar de novo quando a página nem carregou.
    private static final long NOVA_TENTATIVA_MS = 15_000;

    private WebView web;
    private FrameLayout raiz;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private int falhasDoVigia = 0;
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

        raiz = new FrameLayout(this);
        raiz.setBackgroundColor(Color.BLACK);
        setContentView(raiz);
        criarWebView();
        carregar();
        handler.postDelayed(vigia, VIGIA_MS);
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

        web.addJavascriptInterface(new Ponte(), "MTApp");
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
                if (req.isForMainFrame()) tentarDeNovoEmBreve();
            }

            @android.annotation.TargetApi(26)
            @Override
            public boolean onRenderProcessGone(WebView v, RenderProcessGoneDetail detail) {
                // O processo do WebView morreu (memória, na maioria das vezes).
                // Sem tratar isto, o app inteiro cai junto. Recria e segue.
                criarWebView();
                carregar();
                return true;
            }
        });
        raiz.addView(web);
        esconderBarras();
    }

    private void carregar() {
        falhasDoVigia = 0;
        web.loadUrl(urlDoServidor() + "/tv");
    }

    private final Runnable novaTentativa = this::carregar;

    private void tentarDeNovoEmBreve() {
        handler.removeCallbacks(novaTentativa);
        handler.postDelayed(novaTentativa, NOVA_TENTATIVA_MS);
    }

    /*
     * O vigia: a cada minuto pergunta ao player se ele está de pé. Três
     * silêncios seguidos (página em branco, JavaScript travado) recarregam.
     * O player guarda a última programação, então recarregar é seguro mesmo
     * sem internet.
     */
    private final Runnable vigia = new Runnable() {
        @Override
        public void run() {
            web.evaluateJavascript("(function(){return !!(window.MTCloud && document.body);})()", valor -> {
                if ("true".equals(valor)) falhasDoVigia = 0;
                else if (++falhasDoVigia >= FALHAS_PARA_RECARREGAR) carregar();
            });
            handler.postDelayed(this, VIGIA_MS);
        }
    };

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
                .setMessage("Normalmente não precisa mudar. Ex.: https://app.suaempresa.com.br")
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
            if (anterior != null) anterior.uncaughtException(t, e);
            else System.exit(2);
        });
    }

    @Override
    protected void onResume() {
        super.onResume();
        esconderBarras();
        if (web != null) web.onResume();
    }

    @Override
    protected void onPause() {
        // Não pausa o WebView: a TV continua exibindo mesmo se um diálogo do
        // sistema aparecer por cima.
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        if (web != null) web.destroy();
        super.onDestroy();
    }
}
