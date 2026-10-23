package br.com.multitelas.tv;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInstaller;

/*
 * A resposta do instalador do Android à atualização da moldura (D41).
 *
 * Sem ser app de sistema, o Android pede a confirmação de quem está na
 * frente da TV: chega aqui como "ação do usuário pendente", com a tela do
 * instalador para abrir. Deu certo: o Android troca o app e o AoLigar
 * (MY_PACKAGE_REPLACED) reabre o player. Falhou: o Atualizador segue na
 * versão de agora.
 */
public class ResultadoDaInstalacao extends BroadcastReceiver {
    static final String EXTRA_CODIGO = "br.com.multitelas.tv.CODIGO";

    @Override
    @SuppressWarnings("deprecation")
    public void onReceive(Context ctx, Intent intent) {
        int status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE);
        int codigo = intent.getIntExtra(EXTRA_CODIGO, 0);
        if (status == PackageInstaller.STATUS_PENDING_USER_ACTION) {
            Intent confirmar = intent.getParcelableExtra(Intent.EXTRA_INTENT);
            // Sem a tela do instalador (ou bloqueada): o aviso volta e o OK tenta de novo.
            if (confirmar == null) {
                Atualizador.resultado(ctx, PackageInstaller.STATUS_FAILURE_ABORTED, codigo);
                return;
            }
            confirmar.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            try {
                ctx.startActivity(confirmar);
            } catch (RuntimeException bloqueado) {
                Atualizador.resultado(ctx, PackageInstaller.STATUS_FAILURE_ABORTED, codigo);
            }
            return;
        }
        if (status != PackageInstaller.STATUS_SUCCESS) Atualizador.resultado(ctx, status, codigo);
    }
}
