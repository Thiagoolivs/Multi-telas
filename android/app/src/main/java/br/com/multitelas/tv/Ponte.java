package br.com.multitelas.tv;

import android.webkit.JavascriptInterface;

/*
 * O que o player enxerga do app, como `window.MTApp`: só a versão, que
 * aparece no cartão da tela no painel ("App 1.0.N"), e o número dela
 * (versionCode), que o painel compara com a publicada para dizer "há uma
 * versão nova" (D41).
 *
 * Já teve `ler`/`guardar` para a identidade da tela (id e token). Saíram:
 * addJavascriptInterface entrega a ponte a TODO frame da página, inclusive
 * o iframe de um conteúdo "site" com endereço externo, e esse site leria o
 * token da TV. O localStorage do WebView, dentro do app, já não some como o
 * do navegador de algumas TVs — a terceira gaveta não valia o risco. Pelo
 * mesmo motivo, instalar a atualização NÃO passa por aqui: é a moldura que
 * confere e só o OK do controle instala.
 */
public class Ponte {
    @JavascriptInterface
    public String versao() {
        return BuildConfig.VERSION_NAME;
    }

    @JavascriptInterface
    public int codigo() {
        return BuildConfig.VERSION_CODE;
    }
}
