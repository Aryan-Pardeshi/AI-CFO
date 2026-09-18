import React from 'react';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';

const Advisory = () => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 120px)', background: 'var(--surface-color)', border: '1px solid var(--border-color)' }}>
      {/* Header */}
      <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-color)' }}>
        <h2 style={{ margin: 0, fontSize: '1.25rem' }}>ARIA Advisory</h2>
        <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Your private AI wealth intelligence.</p>
      </div>

      {/* Chat Area */}
      <div style={{ flex: 1, padding: '2rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        
        {/* User Message */}
        <div style={{ alignSelf: 'flex-end', maxWidth: '70%' }}>
          <div style={{ background: 'var(--accent-color)', color: 'white', padding: '1rem', borderRadius: '8px 8px 0 8px', fontSize: '0.95rem', lineHeight: 1.5 }}>
            Hello ARIA, can you analyze my recent spending and suggest where I can cut back to increase my savings rate to 25%?
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem', textAlign: 'right' }}>
            Today, 10:42 AM
          </div>
        </div>

        {/* AI Message */}
        <div style={{ alignSelf: 'flex-start', maxWidth: '70%' }}>
          <div style={{ background: 'var(--bg-color)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', padding: '1rem', borderRadius: '8px 8px 8px 0', fontSize: '0.95rem', lineHeight: 1.5 }}>
            <strong>ARIA Advisory is currently in Setup Mode.</strong><br/><br/>
            Our team is wiring up the intelligence engine. Stay tuned for real-time portfolio analysis and wealth-building insights.
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
            ARIA • Today, 10:42 AM
          </div>
        </div>

      </div>

      {/* Input Area */}
      <div style={{ padding: '1.5rem', borderTop: '1px solid var(--border-color)', background: 'var(--bg-color)' }}>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <div style={{ flex: 1 }}>
            <Input id="chat-input" placeholder="Ask ARIA about your finances..." disabled={true} />
          </div>
          <Button disabled={true}>Send</Button>
        </div>
      </div>
    </div>
  );
};

export default Advisory;
