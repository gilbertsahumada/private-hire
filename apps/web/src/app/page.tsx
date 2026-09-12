import { PROJECT_NAME } from '@private-hire/domain';

export default function Page() {
  return (
    <main style={{ maxWidth: 760, margin: '12vh auto', padding: 32 }}>
      <p style={{ color: '#a8c9b5', letterSpacing: 3 }}>
        STAGE 01 / INTEGRATION PROBE
      </p>
      <h1 style={{ fontSize: 44, lineHeight: 1.1 }}>{PROJECT_NAME}</h1>
      <p style={{ fontSize: 20, lineHeight: 1.6 }}>
        A deterministic portfolio agent, confidential workflow transport and an
        Arc testnet report receiver.
      </p>
      <hr style={{ margin: '32px 0', opacity: 0.2 }} />
      <p>Next.js · Cloudflare Workers · D1 · Encrypted R2</p>
      <p>A2A 1.0 · CRE simulation · Arc Testnet</p>
      <p style={{ color: '#b1bdb7', lineHeight: 1.7 }}>
        This page confirms the application is serving. It does not attest a live
        TEE, a confirmed transaction or a payment. Integration evidence is
        recorded separately. No escrow or real portfolio data is handled in this
        stage.
      </p>
      <a style={{ color: '#bce6cc' }} href="/.well-known/agent-card.json">
        View public Agent Card →
      </a>
    </main>
  );
}
