/**
 * Loads CSV data files, joins booth, exhibitor, and event data,
 * and exposes helper methods on window for the navigation UI.
 */

(function() {
function parseCSV(csvText) {
  const lines = csvText.trim().split('\n');
  if (lines.length === 0) return [];

  const headers = lines[0].split(',').map(h => h.trim());
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',');
    if (values.length !== headers.length) continue;

    const row = {};
    headers.forEach((header, idx) => {
      row[header] = values[idx]?.trim() || '';
    });
    rows.push(row);
  }

  return rows;
}

async function loadCSV(pathOrFilename) {
  try {
    // Accept either a full path or a filename from the default data folder.
    const url = (typeof pathOrFilename === 'string' && (pathOrFilename.includes('/') || pathOrFilename.startsWith('http')))
      ? pathOrFilename
      : `assets/data/${pathOrFilename}`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to load ${url}: ${response.statusText}`);
    }
    const text = await response.text();
    return parseCSV(text);
  } catch (error) {
    console.error(`Error loading CSV ${pathOrFilename}:`, error);
    return [];
  }
}

async function loadAllCSVData(eventsPath, exhibitorsPath, assignmentsPath) {
  const ev = eventsPath || 'events.csv';
  const ex = exhibitorsPath || 'exhibitors.csv';
  const asg = assignmentsPath || 'event_exhibitor_booth_assignments.csv';

  const [events, exhibitors, assignments] = await Promise.all([
    loadCSV(ev),
    loadCSV(ex),
    loadCSV(asg)
  ]);

  return {
    events: Array.isArray(events) ? events : [],
    exhibitors: Array.isArray(exhibitors) ? exhibitors : [],
    assignments: Array.isArray(assignments) ? assignments : [],
  };
}

function buildBoothDataMap(arg1, arg2, arg3) {
  // Support both:
  // buildBoothDataMap({ events, exhibitors, assignments })
  // buildBoothDataMap(events, exhibitors, assignments)
  let events, exhibitors, assignments;
  if (arg1 && typeof arg1 === 'object' && !Array.isArray(arg1)) {
    ({ events, exhibitors, assignments } = arg1);
  } else {
    events = arg1;
    exhibitors = arg2;
    assignments = arg3;
  }

  events = Array.isArray(events) ? events : [];
  exhibitors = Array.isArray(exhibitors) ? exhibitors : [];
  assignments = Array.isArray(assignments) ? assignments : [];

  const eventMap = new Map();
  events.forEach(event => {
    eventMap.set(event.eventId, event);
  });

  const exhibitorMap = new Map();
  exhibitors.forEach(exhibitor => {
    exhibitorMap.set(exhibitor.exhibitorId, exhibitor);
  });

  const boothDataMap = {};

  assignments.forEach(assignment => {
    const boothKey = assignment.boothCode || assignment.boothId;
    if (!boothKey) return;

    if (!boothDataMap[boothKey]) {
      boothDataMap[boothKey] = {
        boothId: assignment.boothId,
        boothCode: assignment.boothCode,
        hallName: assignment.hallName,
        zoneId: assignment.zoneId,
        exhibitors: [],
        events: []
      };
    }

    const exhibitor = exhibitorMap.get(assignment.exhibitorId);
    if (exhibitor) {
      boothDataMap[boothKey].exhibitors.push({
        id: exhibitor.exhibitorId,
        name: exhibitor.exhibitorName,
        industry: exhibitor.industry,
        country: exhibitor.hqCountry,
        contact: exhibitor.contactName,
        email: exhibitor.contactEmail,
        phone: exhibitor.contactPhone
      });
    }

    const event = eventMap.get(assignment.eventId);
    if (event) {
      // Avoid adding the same event more than once for a booth.
      const eventExists = boothDataMap[boothKey].events.some(e => e.id === event.eventId);
      if (!eventExists) {
        boothDataMap[boothKey].events.push({
          id: event.eventId,
          name: event.eventName,
          venue: event.venueName,
          startDate: event.startDateTimeUtc,
          endDate: event.endDateTimeUtc,
          expectedAttendance: event.expectedAttendanceTotal,
          status: event.status,
          personInCharge: event.personInChargeName,
          email: event.personInChargeEmail
        });
      }
    }
  });

  return boothDataMap;
}

function getBoothData(boothDataMap, boothIdentifier) {
  return boothDataMap[boothIdentifier] || null;
}

function formatDate(isoDateString) {
  if (!isoDateString) return 'N/A';

  try {
    const date = new Date(isoDateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch (e) {
    return isoDateString;
  }
}

  window.CsvDataService = {
    parseCSV,
    loadCSV,
    loadAllCSVData,
    buildBoothDataMap,
    getBoothData,
    formatDate,
  };
})();
