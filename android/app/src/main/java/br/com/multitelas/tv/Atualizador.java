package br.com.multitelas.tv;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.PackageInstaller;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.TextView;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/*
 * A moldura se atualiza sozinha (EXECUTOR D41).
 *
 * O player é web e se atualiza a cada publicação; esta moldura não, e o APK
 * do Actions expira. Aqui ela pergunta ao NOSSO servidor (/apk/versao.json)
 * se há versão nova, baixa em segundo plano (/apk/ultimo.apk), confere o
 * tamanho e o sha256 e mostra um aviso pequeno no canto, sem tapar o
 * conteúdo do cliente. Quem estiver na frente da TV aperta OK no controle e
 * o instalador do Android abre.
 *
 * Tudo aqui é melhor esforço: rede, espaço, assinatura diferente — qualquer
 * falha deixa a TV na versão de agora, exibindo normalmente. Nunca tela
 * preta por causa de atualização. Rede e disco só na fila de fundo.
 */
final class Atualizador {

    // Depois de abrir, o player sobe primeiro; depois, de 6 em 6 horas.
    private static final long PRIMEIRA_MS = 3 * 60_000L;
    private static final long INTERVALO_MS = 6 * 60 * 60_000L;
    private static final long LIMITE_BYTES = 40L * 1024 * 1024;
    private static final int TEMPO_MS = 20_000;
    private static final String ARQUIVO = "atualizacao.apk";
    private static final String PREFS = "multitelas";
    // A versão que já falhou ao instalar (assinatura diferente, por exemplo): não insiste nela.
    private static final String CHAVE_FALHOU = "atualizacaoFalhou";

    // O que está na tela agora: o resultado do instalador chega por um receiver.
    private static volatile Atualizador ativo;

    private final MainActivity tela;
    private final FrameLayout raiz;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final ExecutorService fila = Executors.newSingleThreadExecutor();
    private TextView aviso;
    private volatile File pronto;
    private volatile int codigoPronto;
    private volatile String nomePronto = "";

    Atualizador(MainActivity tela, FrameLayout raiz) {
        this.tela = tela;
        this.raiz = raiz;
    }

    void comecar() {
        ativo = this;
        fila.execute(this::limparAntigo);
        handler.postDelayed(conferir, PRIMEIRA_MS);
    }

    void parar() {
        if (ativo == this) ativo = null;
        handler.removeCallbacksAndMessages(null);
        fila.shutdownNow();
    }

    boolean temPronto() {
        return pronto != null;
    }

    private final Runnable conferir = new Runnable() {
        @Override
        public void run() {
            try {
                fila.execute(Atualizador.this::conferirAgora);
            } catch (RuntimeException fechada) {
                return;
            }
            handler.postDelayed(this, INTERVALO_MS);
        }
    };

    /* ---------------- Na fila de fundo ---------------- */

    // Já está na versão nova (ou numa mais nova ainda): o arquivo baixado sai.
    private void limparAntigo() {
        new File(tela.getCacheDir(), ARQUIVO).delete();
        new File(tela.getCacheDir(), ARQUIVO + ".parcial").delete();
        SharedPreferences p = prefs(tela);
        if (p.getInt(CHAVE_FALHOU, 0) <= BuildConfig.VERSION_CODE) p.edit().remove(CHAVE_FALHOU).apply();
    }

    private void conferirAgora() {
        File parcial = new File(tela.getCacheDir(), ARQUIVO + ".parcial");
        try {
            String base = tela.urlDoServidor();
            JSONObject v = new JSONObject(new String(baixar(base + "/apk/versao.json", 64 * 1024), "UTF-8"));
            int codigo = v.getInt("versionCode");
            long tamanho = v.getLong("tamanho");
            String sha = v.getString("sha256").toLowerCase(Locale.ROOT);
            String nome = v.optString("versionName", "");
            if (codigo <= BuildConfig.VERSION_CODE) return;
            if (prefs(tela).getInt(CHAVE_FALHOU, 0) == codigo) return;
            if (pronto != null && codigoPronto == codigo) return;
            if (tamanho <= 0 || tamanho > LIMITE_BYTES || !sha.matches("[0-9a-f]{64}")) return;

            String obtido = baixarPara(base + "/apk/ultimo.apk", parcial, tamanho);
            if (!sha.equals(obtido)) {
                parcial.delete();
                return;
            }
            // O pacote é o nosso, na versão anunciada. A assinatura o próprio Android confere ao instalar.
            PackageInfo info = tela.getPackageManager().getPackageArchiveInfo(parcial.getAbsolutePath(), 0);
            if (info == null || !tela.getPackageName().equals(info.packageName) || codigoDe(info) != codigo) {
                parcial.delete();
                return;
            }
            File destino = new File(tela.getCacheDir(), ARQUIVO);
            destino.delete();
            if (!parcial.renameTo(destino)) {
                parcial.delete();
                return;
            }
            codigoPronto = codigo;
            nomePronto = nome;
            pronto = destino;
            handler.post(this::avisarPronto);
        } catch (Throwable falha) {
            // Sem rede, sem versão publicada (404), sem espaço: fica para a próxima conferência.
            parcial.delete();
        }
    }

    private static HttpURLConnection abrir(String endereco) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(endereco).openConnection();
        c.setConnectTimeout(TEMPO_MS);
        c.setReadTimeout(TEMPO_MS);
        c.setUseCaches(false);
        c.setRequestProperty("User-Agent", "MultiTelasTV/" + BuildConfig.VERSION_NAME);
        int status = c.getResponseCode();
        if (status != 200) {
            c.disconnect();
            throw new IllegalStateException("o servidor respondeu " + status);
        }
        return c;
    }

    private static byte[] baixar(String endereco, int limite) throws Exception {
        HttpURLConnection c = abrir(endereco);
        try (InputStream in = c.getInputStream()) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0) {
                if (out.size() + n > limite) throw new IllegalStateException("resposta grande demais");
                out.write(buf, 0, n);
            }
            return out.toByteArray();
        } finally {
            c.disconnect();
        }
    }

    // Grava no arquivo e devolve o sha256 do que veio (null se o tamanho não bateu).
    private static String baixarPara(String endereco, File destino, long tamanho) throws Exception {
        HttpURLConnection c = abrir(endereco);
        MessageDigest md = MessageDigest.getInstance("SHA-256");
        long total = 0;
        try (InputStream in = c.getInputStream(); OutputStream out = new FileOutputStream(destino)) {
            byte[] buf = new byte[64 * 1024];
            int n;
            while ((n = in.read(buf)) > 0) {
                total += n;
                if (total > tamanho) throw new IllegalStateException("maior que o anunciado");
                md.update(buf, 0, n);
                out.write(buf, 0, n);
            }
        } finally {
            c.disconnect();
        }
        return total == tamanho ? hex(md.digest()) : null;
    }

    private static String hex(byte[] b) {
        StringBuilder s = new StringBuilder(b.length * 2);
        for (byte x : b) s.append(Integer.toHexString((x & 0xff) | 0x100).substring(1));
        return s.toString();
    }

    @SuppressWarnings("deprecation")
    private static long codigoDe(PackageInfo p) {
        return Build.VERSION.SDK_INT >= 28 ? p.getLongVersionCode() : p.versionCode;
    }

    private static SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /* ---------------- Instalar (com o OK do controle) ---------------- */

    void instalar() {
        final File apk = pronto;
        final int codigo = codigoPronto;
        if (apk == null || !apk.exists()) {
            pronto = null;
            esconderAviso();
            return;
        }
        // Android 8+: o MultiTelas precisa poder instalar a própria atualização (uma vez).
        if (Build.VERSION.SDK_INT >= 26 && !tela.getPackageManager().canRequestPackageInstalls()) {
            mostrarAviso("Permita que o MultiTelas TV instale apps e aperte OK de novo");
            try {
                tela.startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                        Uri.parse("package:" + tela.getPackageName())));
            } catch (RuntimeException semTela) {
                // Aparelho sem essa tela: o instalador abaixo pergunta por conta própria.
                abrirInstalador(apk, codigo);
            }
            return;
        }
        abrirInstalador(apk, codigo);
    }

    private void abrirInstalador(final File apk, final int codigo) {
        mostrarAviso("Abrindo o instalador…");
        try {
            fila.execute(() -> {
                try {
                    PackageInstaller pi = tela.getPackageManager().getPackageInstaller();
                    PackageInstaller.SessionParams params =
                            new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
                    params.setAppPackageName(tela.getPackageName());
                    int id = pi.createSession(params);
                    try (PackageInstaller.Session s = pi.openSession(id)) {
                        try (InputStream in = new FileInputStream(apk);
                             OutputStream out = s.openWrite("multitelas", 0, apk.length())) {
                            byte[] buf = new byte[64 * 1024];
                            int n;
                            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                            s.fsync(out);
                        }
                        Intent volta = new Intent(tela, ResultadoDaInstalacao.class)
                                .putExtra(ResultadoDaInstalacao.EXTRA_CODIGO, codigo);
                        int flags = PendingIntent.FLAG_UPDATE_CURRENT
                                | (Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0);
                        PendingIntent p = PendingIntent.getBroadcast(tela, id, volta, flags);
                        s.commit(p.getIntentSender());
                    }
                } catch (Throwable falha) {
                    handler.post(() -> falhou(codigo));
                }
            });
        } catch (RuntimeException fechada) {
            esconderAviso();
        }
    }

    /*
     * A resposta do instalador (ResultadoDaInstalacao). Cancelado na tela do
     * Android: o aviso volta e o OK tenta de novo. Outra falha (assinatura
     * diferente, sem espaço): não insiste nessa versão; segue na de agora.
     */
    static void resultado(Context ctx, int status, int codigo) {
        Atualizador a = ativo;
        if (status == PackageInstaller.STATUS_FAILURE_ABORTED) {
            if (a != null) a.handler.post(a::avisarPronto);
            return;
        }
        if (codigo > 0) prefs(ctx).edit().putInt(CHAVE_FALHOU, codigo).apply();
        if (a != null) a.handler.post(() -> a.falhou(codigo));
    }

    private void falhou(int codigo) {
        if (codigo > 0) prefs(tela).edit().putInt(CHAVE_FALHOU, codigo).apply();
        pronto = null;
        esconderAviso();
        fila.execute(() -> new File(tela.getCacheDir(), ARQUIVO).delete());
    }

    /* ---------------- O aviso no canto ---------------- */

    private void avisarPronto() {
        if (pronto == null) return;
        String nome = nomePronto.isEmpty() ? "" : " " + nomePronto;
        mostrarAviso("Atualização do app" + nome + " pronta · aperte OK para instalar");
    }

    private void mostrarAviso(String texto) {
        if (aviso == null) {
            aviso = new TextView(tela);
            aviso.setTextColor(Color.WHITE);
            aviso.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
            aviso.setPadding(dp(14), dp(8), dp(14), dp(8));
            GradientDrawable fundo = new GradientDrawable();
            fundo.setColor(0xCC0B1020);
            fundo.setCornerRadius(dp(10));
            aviso.setBackground(fundo);
            aviso.setFocusable(false);
            FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT,
                    Gravity.TOP | Gravity.END);
            lp.setMargins(0, dp(14), dp(14), 0);
            raiz.addView(aviso, lp);
        }
        aviso.setText(texto);
        aviso.setVisibility(View.VISIBLE);
        aviso.bringToFront();
    }

    private void esconderAviso() {
        if (aviso != null) aviso.setVisibility(View.GONE);
    }

    private int dp(int v) {
        return Math.round(v * tela.getResources().getDisplayMetrics().density);
    }
}
