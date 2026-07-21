import React from 'react';
import { Hammer } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader.jsx';
import { Panel } from '../components/ui/Panel.jsx';
import { EmptyState } from '../components/ui/Feedback.jsx';

// Seções ainda não construídas — mantêm a navegação coerente e o mesmo
// design system, sem "dashboard conceito". Serão implementadas em seguida.
export function PlaceholderPage({ title, subtitle }) {
  return (
    <div>
      <PageHeader title={title} subtitle={subtitle} />
      <Panel>
        <EmptyState
          icon={Hammer}
          title="Em construção"
          description="Esta seção entra na próxima etapa. A visão geral já está operacional."
        />
      </Panel>
    </div>
  );
}
