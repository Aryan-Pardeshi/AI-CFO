import React, { useState } from 'react';

export default function ActivityTrace({ activity = [], citations = [] }) {
  const [open, setOpen] = useState(false);
  if (!activity.length && !citations.length) return null;
  return (
    <details className="aria-activity-trace" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>ARIA activity</summary>
      <div className="aria-activity-items">
        {activity.map((item, index) => (
          <span className="aria-activity-tag" key={`${item.name}-${index}`}>
            {item.name} · {item.source} · {item.status}
          </span>
        ))}
      </div>
      {citations.length > 0 && (
        <div className="aria-citations">
          {citations.map((citation) => (
            citation.url ? (
              <a key={`${citation.url}-${citation.as_of}`} href={citation.url} target="_blank" rel="noreferrer">
                {citation.title} ({citation.as_of})
              </a>
            ) : (
              <span key={`${citation.title}-${citation.as_of}`}>{citation.title} ({citation.as_of})</span>
            )
          ))}
        </div>
      )}
    </details>
  );
}
