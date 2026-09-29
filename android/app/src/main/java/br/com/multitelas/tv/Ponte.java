package br.com.multitelas.tv;

import android.content.Context;
import android.content.SharedPreferences;
import android.webkit.JavascriptInterface;

/*
 * O que o player enxerga do app, como `window.MTApp`.
 *
 *   - versao(): aparece no cartão da tela no painel ("App 1.0.0"), para o
 *     suporte saber o que está instalado sem ir até a TV;
 *   - ler/guardar: uma terceira gaveta para a identidade da tela (id e token),
 *     além do localStorage e do cookie. Mora nas preferências do app, que só
 *     somem se alguém apagar os dados do app de propósito.
 *
 * Só chaves com prefixo "mt." e valores curtos: a ponte é chamável por
 * qualquer página que o WebView abrir, e o WebView só abre o nosso servidor
 * (ver shouldOverrideUrlLoading), mas guardar sem limite não custa nada evitar.
 */
public class Ponte {
    private static final String PREFS = "multitelas-identidade";
    private final SharedPreferences prefs;

    Ponte(Context ctx) {
        this.prefs = ctx.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    @JavascriptInterface
    public String versao() {
        return BuildConfig.VERSION_NAME;
    }

    @JavascriptInterface
    public String ler(String chave) {
        if (!valida(chave)) return null;
        return prefs.getString(chave, null);
    }

    @JavascriptInterface
    public void guardar(String chave, String valor) {
        if (!valida(chave)) return;
        if (valor == null) prefs.edit().remove(chave).apply();
        else if (valor.length() <= 512) prefs.edit().putString(chave, valor).apply();
    }

    private static boolean valida(String chave) {
        return chave != null && chave.startsWith("mt.") && chave.length() <= 64;
    }
}
