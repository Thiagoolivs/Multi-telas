package br.com.multitelas.tv;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/*
 * Abre o player quando o aparelho liga (ou quando o app é atualizado).
 *
 * É o plano B. No Android 10 em diante, abrir activity a partir daqui é
 * bloqueado para a maioria dos apps; o caminho que sempre funciona é definir
 * o MultiTelas TV como TELA INICIAL do aparelho (ver o manifesto e o
 * android/README.md). Nos boxes com Android 9 ou anterior, isto basta.
 */
public class AoLigar extends BroadcastReceiver {
    @Override
    public void onReceive(Context ctx, Intent intent) {
        Intent abrir = new Intent(ctx, MainActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        try {
            ctx.startActivity(abrir);
        } catch (RuntimeException bloqueado) {
            // Android 10+ sem ser a tela inicial: nada a fazer daqui.
        }
    }
}
