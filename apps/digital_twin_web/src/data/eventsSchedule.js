// Static event schedule for DWTC convention centre halls.
// Keys must match hall IDs from hallsLayout.js.

export const EVENTS_SCHEDULE = {
  hall1: [
    { id: 'evt001', title: 'AI & Smart Cities Summit', time: '09:00', endTime: '12:00', expectedAttendance: 450, category: 'tech' },
    { id: 'evt002', title: 'Networking Lunch', time: '12:30', endTime: '14:00', expectedAttendance: 200, category: 'social' },
  ],
  hall3: [
    { id: 'evt003', title: 'IoT Security Workshop', time: '10:00', endTime: '13:00', expectedAttendance: 300, category: 'tech' },
  ],
  hall7: [
    { id: 'evt004', title: 'Tech Keynote: Future of LLMs', time: '14:00', endTime: '16:00', expectedAttendance: 800, category: 'keynote' },
    { id: 'evt005', title: 'Startup Demo Day', time: '16:30', endTime: '18:00', expectedAttendance: 350, category: 'demo' },
  ],
  hall8: [
    { id: 'evt010', title: 'Sustainability Panel', time: '15:00', endTime: '17:00', expectedAttendance: 250, category: 'panel' },
  ],
  easthall1: [
    { id: 'evt011', title: 'VR / AR Demo Zone', time: '09:00', endTime: '18:00', expectedAttendance: 400, category: 'demo' },
  ],
  easthall3: [
    { id: 'evt006', title: 'Green Energy Expo', time: '08:00', endTime: '17:00', expectedAttendance: 600, category: 'expo' },
  ],
  southhall2: [
    { id: 'evt007', title: 'Digital Art Installation', time: '10:00', endTime: '20:00', expectedAttendance: 150, category: 'art' },
  ],
  northhall2: [
    { id: 'evt008', title: 'Emergency Response Drill', time: '11:00', endTime: '12:00', expectedAttendance: 100, category: 'safety' },
    { id: 'evt009', title: 'Robotics Competition', time: '13:00', endTime: '17:00', expectedAttendance: 500, category: 'competition' },
  ],
};

export function getAttendanceLevel(expected) {
  if (expected <= 200) return { color: '#4ade80', label: 'Low' };
  if (expected <= 500) return { color: '#fbbf24', label: 'Medium' };
  return { color: '#ef4444', label: 'High' };
}
