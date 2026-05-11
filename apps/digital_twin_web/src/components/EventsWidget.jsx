import React from 'react';
import { EVENTS_SCHEDULE, getAttendanceLevel } from '../data/eventsSchedule';

export default function EventsWidget({ hallId }) {
  const events = EVENTS_SCHEDULE[hallId?.toLowerCase()];
  if (!events || events.length === 0) return null;

  const sorted = [...events].sort((a, b) => a.time.localeCompare(b.time));

  return (
    <div style={{ marginTop: '16px', borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>
      <h4 style={{ fontSize: 'var(--text-sm)', color: 'var(--text-accent)', textTransform: 'uppercase', letterSpacing: '1px', margin: '0 0 10px 0' }}>
        Upcoming Events
      </h4>
      {sorted.map(evt => {
        const level = getAttendanceLevel(evt.expectedAttendance);
        return (
          <div key={evt.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginBottom: '10px' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: level.color, flexShrink: 0, marginTop: 4 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: 'var(--text-primary)', fontWeight: 500, fontSize: 'var(--text-sm)', lineHeight: 1.3 }}>{evt.title}</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-xs)', marginTop: 2 }}>
                {evt.time} – {evt.endTime} &middot; ~{evt.expectedAttendance} attendees
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
