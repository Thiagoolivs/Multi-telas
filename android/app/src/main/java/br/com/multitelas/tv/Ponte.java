package br.com.multitelas.tv;

import android.content.Context;
import android.webkit.JavascriptInterface;

/*
 * O que o player enxerga do app, como `window.MTApp`: a versão, que aparece
 * no cartão da tela no painel ("App 1.0.N"), e o número dela (versionCode),
 * que o painel compara com a publicada para dizer "há uma versão nova" (D41).
 * Desde o vigia v2, também: se o app é a tela inicial do aparelho (o painel
 * avisa quando não é), o que o vigia do app já fez, e a versão do vigia —
 * com ela a página sabe que pode pedir um WebView novo pela marca
 * `window.MT_REINICIAR` (js/vigia.js, reiniciarApp).
 *
 * Tudo aqui só LÊ. Já teve `ler`/`guardar` para a identidade da tela (id e
 * token). Saíram: addJavascriptInterface entrega a ponte a TODO frame da
 * página, inclusive o iframe de um conteúdo "site" com endereço externo, e
 * esse site leria o token da TV. O localStorage do WebView, dentro do app, já
 * não some como o do navegador de algumas TVs — a terceira gaveta não valia o
 * risco. Pelo mesmo motivo, instalar a atualização NÃO passa por aqui (é a
 * moldura que confere e só o OK do controle instala), e reiniciar também não:
 * um site externo chamaria em laço. O pedido de reinício é uma marca que só a
 * própria página põe, e o vigia do app lê e freia (RegrasDoVigia).
 */
public class Ponte {
    // Os métodos da ponte rodam fora da thread da tela: nada daqui mexe no WebView.
    private final Context ctx;

    Ponte(Context ctx) {
        this.ctx = ctx;
    }

    @JavascriptInterface
    public String versao() {
        return BuildConfig.VERSION_NAME;
    }

    @JavascriptInterface
    public int codigo() {
        return BuildConfig.VERSION_CODE;
    }

    // 2: o vigia conta o silêncio e atende window.MT_REINICIAR. As cascas de antes não têm o método.
    @JavascriptInterface
    public int vigia() {
        return 2;
    }

    @JavascriptInterface
    public boolean telaInicial() {
        return MainActivity.ehTelaInicial(ctx);
    }

    @JavascriptInterface
    public String vigiaResumo() {
        return MainActivity.resumoDoVigia();
    }
}
