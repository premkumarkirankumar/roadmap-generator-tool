import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import "./App.css";

const STORAGE_KEY = "delivery-roadmap-creator-v3";
const STATUS_OPTIONS = ["Planned", "In Progress", "At Risk", "Done"];
const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const defaultState = {
  activePage: "input",
  portfolioName: "Delivery Roadmap",
  teamName: "",
  audience: "Delivery leadership and cross-functional stakeholders",
  vision:
    "Add initiatives, work items, and milestones through structured inputs, then convert them into a leadership-ready delivery roadmap.",
  initiatives: [],
  workItems: [],
  milestones: [],
};

function parseDateInput(value) {
  if (!value) {
    return null;
  }

  const [yearText, monthText, dayText] = String(value).split("-");
  const year = Number.parseInt(yearText, 10);
  const month = Number.parseInt(monthText, 10);
  const day = Number.parseInt(dayText, 10);

  if ([year, month, day].some(Number.isNaN)) {
    return null;
  }

  return new Date(Date.UTC(year, month - 1, day));
}

function formatDateInput(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function normalizeExcelDate(value) {
  if (!value && value !== 0) {
    return "";
  }

  if (value instanceof Date) {
    return formatDateInput(
      new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate())),
    );
  }

  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);

    if (!parsed) {
      return "";
    }

    return formatDateInput(
      new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d)),
    );
  }

  const text = String(value).trim();

  if (!text) {
    return "";
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return text;
  }

  const parsedDate = new Date(text);

  if (Number.isNaN(parsedDate.getTime())) {
    return "";
  }

  return formatDateInput(
    new Date(
      Date.UTC(
        parsedDate.getFullYear(),
        parsedDate.getMonth(),
        parsedDate.getDate(),
      ),
    ),
  );
}

function parseQuarterString(value) {
  const match = String(value || "")
    .trim()
    .match(/^Q([1-4])\s+(\d{4})$/i);

  if (!match) {
    return "";
  }

  const quarter = Number.parseInt(match[1], 10);
  const year = Number.parseInt(match[2], 10);
  const monthIndex = quarter * 3 - 1;

  return formatDateInput(new Date(Date.UTC(year, monthIndex, 1)));
}

function formatRoadmapTitleFromFilename(fileName) {
  const baseName = String(fileName || "")
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .trim();

  if (!baseName) {
    return "Delivery Roadmap";
  }

  const words = baseName.split(/\s+/).map((word) => {
    if (!word) {
      return word;
    }

    return word.charAt(0).toUpperCase() + word.slice(1);
  });
  return words.join(" ");
}

function startOfMonth(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function endOfMonth(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
}

function addMonths(date, months) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
}

function monthDiff(startDate, endDate) {
  return (
    (endDate.getUTCFullYear() - startDate.getUTCFullYear()) * 12 +
    (endDate.getUTCMonth() - startDate.getUTCMonth())
  );
}

function formatMonth(date) {
  return `${MONTH_NAMES[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

function getQuarterLabel(date) {
  return `Q${Math.floor(date.getUTCMonth() / 3) + 1} ${date.getUTCFullYear()}`;
}

function getQuarterRange(startDate, endDate) {
  if (!startDate || !endDate) {
    return "Quarter pending";
  }

  return `${getQuarterLabel(startDate)} to ${getQuarterLabel(endDate)}`;
}

function clampStatus(status, atRisk) {
  if (atRisk) {
    return "At Risk";
  }

  return STATUS_OPTIONS.includes(status) ? status : "Planned";
}

function toTimelineIndex(dateString, timelineStart) {
  const date = parseDateInput(dateString);

  if (!date || !timelineStart) {
    return 0;
  }

  return Math.max(0, monthDiff(timelineStart, startOfMonth(date)));
}

function deriveDurationMonths(item) {
  const explicitDuration = Math.max(1, Number.parseInt(item.duration, 10) || 1);
  const startDate = parseDateInput(item.startDate);
  const endDate = parseDateInput(item.endDate);

  if (!startDate || !endDate || endDate < startDate) {
    return explicitDuration;
  }

  return Math.max(1, monthDiff(startOfMonth(startDate), startOfMonth(endDate)) + 1);
}

function deriveTimeline(state) {
  const timelineDates = [];

  state.initiatives.forEach((initiative) => {
    const startDate = parseDateInput(initiative.startDate);
    const endDate = parseDateInput(initiative.endDate);

    if (startDate) {
      timelineDates.push(startOfMonth(startDate));
    }

    if (endDate) {
      timelineDates.push(startOfMonth(endDate));
    }
  });

  state.workItems.forEach((item) => {
    const startDate = parseDateInput(item.startDate);

    if (!startDate) {
      return;
    }

    const startMonth = startOfMonth(startDate);
    timelineDates.push(startMonth);
    timelineDates.push(addMonths(startMonth, deriveDurationMonths(item) - 1));
  });

  state.milestones.forEach((milestone) => {
    const milestoneDate = parseDateInput(milestone.date);

    if (milestoneDate) {
      timelineDates.push(startOfMonth(milestoneDate));
    }
  });

  const defaultStart = new Date(Date.UTC(2026, 0, 1));
  const earliestDate = timelineDates.length
    ? new Date(Math.min(...timelineDates.map((entry) => entry.getTime())))
    : defaultStart;
  const latestDate = timelineDates.length
    ? new Date(Math.max(...timelineDates.map((entry) => entry.getTime())))
    : addMonths(defaultStart, 5);
  const safeStart = startOfMonth(earliestDate);
  let safeEnd = startOfMonth(latestDate);

  if (monthDiff(safeStart, safeEnd) + 1 < 6) {
    safeEnd = addMonths(safeStart, 5);
  }

  const totalMonths = monthDiff(safeStart, safeEnd) + 1;

  return Array.from({ length: totalMonths }, (_, index) => {
    const date = addMonths(safeStart, index);

    return {
      index,
      date,
      label: formatMonth(date),
      shortLabel: MONTH_NAMES[date.getUTCMonth()],
      quarter: getQuarterLabel(date),
    };
  });
}

function prepareInitiatives(initiatives, timeline) {
  const timelineStart = timeline[0]?.date;
  const maxIndex = Math.max(0, timeline.length - 1);

  return initiatives.map((initiative) => {
    const startDate = parseDateInput(initiative.startDate);
    const endDate = parseDateInput(initiative.endDate) || startDate;
    const startIndex = Math.min(
      toTimelineIndex(initiative.startDate, timelineStart),
      maxIndex,
    );
    const endIndex = Math.min(
      Math.max(startIndex, toTimelineIndex(initiative.endDate || initiative.startDate, timelineStart)),
      maxIndex,
    );

    return {
      ...initiative,
      startDateObj: startDate,
      endDateObj: endDate,
      startIndex,
      endIndex,
      quarterRange: getQuarterRange(startDate, endDate),
    };
  });
}

function scheduleWorkItems(workItems, preparedInitiatives, timeline) {
  const timelineStart = timeline[0]?.date;
  const maxIndex = Math.max(0, timeline.length - 1);
  const initiativeMap = new Map(preparedInitiatives.map((initiative) => [initiative.id, initiative]));
  const itemMap = new Map(workItems.map((item) => [item.id, item]));
  const indegree = new Map(workItems.map((item) => [item.id, 0]));
  const adjacency = new Map(workItems.map((item) => [item.id, []]));

  workItems.forEach((item) => {
    item.dependencyIds.forEach((dependencyId) => {
      if (!itemMap.has(dependencyId)) {
        return;
      }

      indegree.set(item.id, (indegree.get(item.id) || 0) + 1);
      adjacency.get(dependencyId)?.push(item.id);
    });
  });

  const queue = workItems.filter((item) => indegree.get(item.id) === 0);
  const ordered = [];

  while (queue.length > 0) {
    const current = queue.shift();

    if (!current) {
      break;
    }

    ordered.push(current);

    (adjacency.get(current.id) || []).forEach((nextId) => {
      const nextDegree = (indegree.get(nextId) || 0) - 1;
      indegree.set(nextId, nextDegree);

      if (nextDegree === 0) {
        const nextItem = itemMap.get(nextId);

        if (nextItem) {
          queue.push(nextItem);
        }
      }
    });
  }

  const hasCycle = ordered.length !== workItems.length;
  const unresolvedIds = new Set(
    hasCycle
      ? workItems
          .filter((item) => !ordered.some((entry) => entry.id === item.id))
          .map((item) => item.id)
      : [],
  );
  const executionOrder = hasCycle
    ? [...ordered, ...workItems.filter((item) => unresolvedIds.has(item.id))]
    : ordered;
  const scheduledMap = new Map();

  const scheduledItems = executionOrder.map((item) => {
    const initiative = initiativeMap.get(item.initiativeId) || preparedInitiatives[0] || null;
    const duration = deriveDurationMonths(item);
    const requestedStart = Math.min(toTimelineIndex(item.startDate, timelineStart), maxIndex);
    const dependencyEnds = item.dependencyIds
      .map((dependencyId) => scheduledMap.get(dependencyId))
      .filter(Boolean)
      .map((dependency) => dependency.endIndex);
    const earliestStart = dependencyEnds.length
      ? Math.max(...dependencyEnds) + 1
      : initiative?.startIndex || 0;
    const startIndex = Math.max(requestedStart, earliestStart, initiative?.startIndex || 0);
    const endIndex = startIndex + duration - 1;
    const horizonDate = endOfMonth(addMonths(timelineStart, Math.min(endIndex, maxIndex)));
    const initiativeEnd = initiative?.endDateObj ? endOfMonth(initiative.endDateObj).getTime() : Number.MAX_SAFE_INTEGER;
    const beyondInitiative = horizonDate.getTime() > initiativeEnd;
    const beyondHorizon = endIndex > maxIndex;
    const circularDependency = unresolvedIds.has(item.id);
    const atRisk = beyondInitiative || beyondHorizon || circularDependency;
    const scheduledItem = {
      ...item,
      initiative,
      duration,
      startIndex,
      endIndex,
      displayEndIndex: Math.min(endIndex, maxIndex),
      requestedQuarter: getQuarterLabel(parseDateInput(item.startDate) || timelineStart),
      dependencyNames: item.dependencyIds
        .map((dependencyId) => itemMap.get(dependencyId)?.name)
        .filter(Boolean),
      atRisk,
      circularDependency,
      status: clampStatus(item.status, atRisk),
    };

    if (scheduledItem.dependencyNames.length === 0 && item.dependencyRefs?.length) {
      scheduledItem.dependencyNames = item.dependencyRefs;
    }

    scheduledMap.set(item.id, scheduledItem);

    return scheduledItem;
  });

  return { scheduledItems, hasCycle };
}

function prepareMilestones(milestones, preparedInitiatives, timeline) {
  const timelineStart = timeline[0]?.date;
  const initiativeMap = new Map(preparedInitiatives.map((initiative) => [initiative.id, initiative]));

  return milestones.map((milestone) => ({
    ...milestone,
    monthIndex: Math.min(
      Math.max(0, toTimelineIndex(milestone.date, timelineStart)),
      Math.max(0, timeline.length - 1),
    ),
    quarter: getQuarterLabel(parseDateInput(milestone.date) || timelineStart),
    initiative: initiativeMap.get(milestone.initiativeId) || preparedInitiatives[0] || null,
  }));
}

function buildDependencyMap(scheduledItems) {
  const itemMap = new Map(scheduledItems.map((item) => [item.id, item]));

  return scheduledItems
    .flatMap((item) => {
      if (item.dependencyIds.length > 0) {
        return item.dependencyIds.map((dependencyId) => {
          const dependency = itemMap.get(dependencyId);

          if (!dependency) {
            return null;
          }

          const crossInitiative =
            dependency.initiative?.id !== item.initiative?.id &&
            dependency.initiative &&
            item.initiative;

          return {
            id: `${dependencyId}-${item.id}`,
            from: dependency.name,
            to: item.name,
            note: crossInitiative
              ? `${dependency.initiative.name} -> ${item.initiative.name}`
              : `${dependency.name} completes before ${item.name} can advance.`,
          };
        });
      }

      return (item.dependencyRefs || []).map((reference, index) => ({
        id: `raw-${item.id}-${index}`,
        from: reference,
        to: item.name,
        note: `${reference} is a prerequisite for ${item.name}.`,
      }));
    })
    .filter(Boolean);
}

function buildExecutiveSummaries(preparedInitiatives, scheduledItems, preparedMilestones) {
  return preparedInitiatives.map((initiative) => {
    const items = scheduledItems
      .filter((item) => item.initiative?.id === initiative.id)
      .sort((left, right) => left.startIndex - right.startIndex);
    const milestones = preparedMilestones.filter(
      (milestone) => milestone.initiative?.id === initiative.id,
    );
    const risks = items.filter((item) => item.atRisk);
    const nowItem = items[0];
    const nextItem = items[1];
    const laterItem = items[items.length - 1];

    return {
      id: initiative.id,
      title: initiative.name,
      theme: initiative.theme,
      bullets: [
        `Drive ${initiative.theme.toLowerCase() || "delivery"} outcomes across ${initiative.quarterRange}.`,
        nowItem
          ? `Now: ${nowItem.name}.${nextItem ? ` Next: ${nextItem.name}.` : ""}${laterItem && laterItem !== nowItem ? ` Later: ${laterItem.name}.` : ""}`
          : "Add work items to generate a now/next/later sequence.",
        risks.length > 0
          ? `Watchpoint: ${risks[0].name} is under schedule pressure because of dependencies or timeline spillover.`
          : `Dependencies are currently sequenced cleanly for this initiative.`,
        milestones.length > 0
          ? `Milestones: ${milestones.map((milestone) => `${milestone.quarter} - ${milestone.label}`).join(" | ")}`
          : "No milestones imported yet.",
      ],
    };
  });
}

function normalizeHeaderKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function getRowValue(row, keys) {
  const entries = Object.entries(row);

  for (const [key, value] of entries) {
    if (keys.includes(normalizeHeaderKey(key))) {
      return value;
    }
  }

  return "";
}

function shouldIgnoreSheet(sheetName) {
  const normalized = String(sheetName || "")
    .trim()
    .toLowerCase();

  if (!normalized) {
    return true;
  }

  return !normalized.startsWith("initiative");
}

function buildStateFromWorkbook(workbook, currentState) {
  const sheets = workbook.SheetNames.filter((sheetName) => !shouldIgnoreSheet(sheetName)).map(
    (sheetName, sheetIndex) => {
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, {
        defval: "",
        raw: true,
        blankrows: false,
      });
      const itemRows = rows.filter((row) =>
        String(getRowValue(row, ["itemname", "item"])).trim(),
      );
      const firstRow = rows[0] || {};
      const rowDates = itemRows
        .flatMap((row) => [
          normalizeExcelDate(getRowValue(row, ["startdate"])),
          normalizeExcelDate(getRowValue(row, ["enddate"])),
        ])
        .filter(Boolean)
        .map((value) => parseDateInput(value))
        .filter(Boolean)
        .sort((left, right) => left.getTime() - right.getTime());
      const firstStart = rowDates[0] ? formatDateInput(rowDates[0]) : "";
      const lastEnd = rowDates[rowDates.length - 1]
        ? formatDateInput(rowDates[rowDates.length - 1])
        : firstStart;
      const initiativeName =
        String(getRowValue(firstRow, ["initiative", "empty"])).trim() || sheetName;
      const initiativeId = `initiative-import-${sheetIndex + 1}`;

      return {
        sheetName,
        initiative: {
          id: initiativeId,
          name: initiativeName,
          startDate: firstStart,
          endDate: lastEnd || firstStart,
          theme: "",
          narrative:
            String(getRowValue(firstRow, ["initiativenarrativetheme"])).trim() || "",
        },
        rows,
        itemRows,
      };
    },
  );

  const initiatives = sheets.map((entry) => entry.initiative);
  const workItems = [];
  const milestones = [];
  const itemLookup = new Map();
  const pendingDependencies = [];

  sheets.forEach((sheetEntry, sheetIndex) => {
    sheetEntry.itemRows.forEach((row, rowIndex) => {
      const itemName = String(
        getRowValue(row, ["item", "itemname", "workitem", "workitemname"]),
      ).trim();

      if (!itemName) {
        return;
      }

      const itemId = `item-import-${sheetIndex + 1}-${rowIndex + 1}`;
      const startDate = normalizeExcelDate(getRowValue(row, ["startdate"]));
      const endDate = normalizeExcelDate(getRowValue(row, ["enddate"]));
      const durationValue = String(
        getRowValue(row, ["duration", "durationmonths", "months"]),
      ).trim();
      const item = {
        id: itemId,
        initiativeId: sheetEntry.initiative.id,
        name: itemName,
        description: String(getRowValue(row, ["description"])).trim(),
        owner: String(getRowValue(row, ["owner", "lead"])).trim(),
        startDate,
        endDate,
        duration: durationValue || String(Math.max(1, deriveDurationMonths({
          startDate,
          endDate,
          duration: "1",
        }))),
        status:
          String(getRowValue(row, ["status"])).trim() || "Planned",
        dependencyIds: [],
        dependencyRefs: [],
        progress: 0,
      };
      const dependencyText = String(
        getRowValue(row, ["dependencies", "dependency", "dependson"]),
      ).trim();

      workItems.push(item);
      itemLookup.set(
        `${sheetEntry.sheetName.toLowerCase()}::${itemName.toLowerCase()}`,
        itemId,
      );
      itemLookup.set(
        `${sheetEntry.initiative.name.toLowerCase()}::${itemName.toLowerCase()}`,
        itemId,
      );

      if (dependencyText && dependencyText.toLowerCase() !== "none") {
        pendingDependencies.push({
          initiativeName: sheetEntry.initiative.name,
          itemId,
          references: dependencyText
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean),
        });
      }

      const milestoneLabel = String(
        getRowValue(row, ["milestone", "milestonelabel"]),
      ).trim();
      const milestoneDate =
        normalizeExcelDate(getRowValue(row, ["milestonedate", "milestonewhen"])) ||
        parseQuarterString(getRowValue(row, ["milestonequarter"]));

      if (milestoneLabel && milestoneDate) {
        milestones.push({
          id: `milestone-import-${sheetIndex + 1}-${rowIndex + 1}`,
          initiativeId: sheetEntry.initiative.id,
          itemId,
          date: milestoneDate,
          label: milestoneLabel,
        });
      }
    });
  });

  pendingDependencies.forEach((entry) => {
    const item = workItems.find((candidate) => candidate.id === entry.itemId);

    if (!item) {
      return;
    }

    item.dependencyIds = entry.references
      .map((reference) => {
        const [initiativeName, itemName] = reference.includes("::")
          ? reference.split("::")
          : [entry.initiativeName, reference];
        const key = `${String(initiativeName).trim().toLowerCase()}::${String(itemName)
          .trim()
          .toLowerCase()}`;

        return itemLookup.get(key) || null;
      })
      .filter(Boolean);
    item.dependencyRefs = entry.references;
  });

  return {
    ...currentState,
    activePage: "input",
    initiatives: initiatives.length > 0 ? initiatives : currentState.initiatives,
    workItems: workItems.length > 0 ? workItems : currentState.workItems,
    milestones,
  };
}

function downloadExcelTemplate() {
  const workbook = XLSX.utils.book_new();
  const initiativeSheet = XLSX.utils.aoa_to_sheet([
    [
      "Initiative",
      "Initiative Narrative Theme",
      "Item Name",
      "Description",
      "Start Date",
      "End Date",
      "Owner",
      "Status",
      "Milestone",
      "Milestone Quarter",
      "Dependencies",
    ],
    [
      "Initiative 1",
      "Shift from manual QA to scalable, intelligence-driven quality execution",
      "Establish logging & observability foundation",
      "Create the baseline observability layer for downstream monitoring use cases.",
      "2026-01-15",
      "2026-03-31",
      "Platform Lead",
      "Planned",
      "Observability foundation ready",
      "Q1 2026",
      "None",
    ],
    [
      "Initiative 1",
      "Shift from manual QA to scalable, intelligence-driven quality execution",
      "Role-based dashboards integrated into SDLC",
      "Extend visibility into the delivery lifecycle with role-specific dashboards.",
      "2026-04-01",
      "2026-06-30",
      "Engineering Insights Lead",
      "Planned",
      "",
      "",
      "Establish logging & observability foundation",
    ],
    [
      "Initiative 1",
      "Shift from manual QA to scalable, intelligence-driven quality execution",
      "AI-assisted anomaly detection and proactive alerting",
      "Use AI-assisted signals to catch delivery issues earlier across environments.",
      "2026-07-01",
      "2026-09-30",
      "SRE Lead",
      "Planned",
      "Anomaly detection pilot",
      "Q3 2026",
      "Initiative 2::Migrate release automation / orchestration",
    ],
  ]);

  initiativeSheet["!cols"] = [
    { wch: 22 },
    { wch: 64 },
    { wch: 42 },
    { wch: 68 },
    { wch: 14 },
    { wch: 14 },
    { wch: 24 },
    { wch: 14 },
    { wch: 30 },
    { wch: 18 },
    { wch: 48 },
  ];

  XLSX.utils.book_append_sheet(workbook, initiativeSheet, "Initiative 1");
  XLSX.writeFile(workbook, "delivery-roadmap-template.xlsx");
}

function downloadJsonFile(payload, filename) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function normalizeWorkItems(items) {
  return items.map((item) => ({
    ...item,
    progress: typeof item.progress === "number" ? item.progress : 0,
  }));
}

function calculateInitiativeProgress(items) {
  if (items.length === 0) return 0;
  const totalProgress = items.reduce((sum, item) => sum + (item.progress || 0), 0);
  return Math.round(totalProgress / items.length);
}

function calculatePortfolioProgress(initiatives, items) {
  const initiativeProgressValues = initiatives.map((initiative) => {
    const initiativeItems = items.filter((item) => item.initiativeId === initiative.id);
    return calculateInitiativeProgress(initiativeItems);
  });

  if (initiativeProgressValues.length === 0) return 0;
  const totalProgress = initiativeProgressValues.reduce((sum, progress) => sum + progress, 0);
  return Math.round(totalProgress / initiativeProgressValues.length);
}

function getProgressBadgeColor(progress) {
  if (progress < 34) return "progress-badge-red";
  if (progress < 67) return "progress-badge-yellow";
  return "progress-badge-green";
}

function App() {
  const [state, setState] = useState(() => {
    if (typeof window === "undefined") {
      return defaultState;
    }

    const stored = window.localStorage.getItem(STORAGE_KEY);

    if (!stored) {
      return defaultState;
    }

    try {
      const parsed = JSON.parse(stored);

      return {
        ...defaultState,
        ...parsed,
        initiatives: Array.isArray(parsed.initiatives)
          ? parsed.initiatives
          : defaultState.initiatives,
        workItems: Array.isArray(parsed.workItems)
          ? normalizeWorkItems(parsed.workItems)
          : defaultState.workItems,
        milestones: Array.isArray(parsed.milestones)
          ? parsed.milestones
          : defaultState.milestones,
      };
    } catch {
      return defaultState;
    }
  });
  const [importMessage, setImportMessage] = useState("");
  const [expandedItemId, setExpandedItemId] = useState("");
  const [selectedFileName, setSelectedFileName] = useState("");
  const [pendingWorkbook, setPendingWorkbook] = useState(null);
  const [visibleStartIndex, setVisibleStartIndex] = useState(0);
  const [visibleEndIndex, setVisibleEndIndex] = useState(0);
  const [collapsedInitiatives, setCollapsedInitiatives] = useState({});
  const [showDependencies, setShowDependencies] = useState(false);
  const [dependencyPanelOpen, setDependencyPanelOpen] = useState(false);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const roadmapModel = useMemo(() => {
    const timeline = deriveTimeline(state);
    const preparedInitiatives = prepareInitiatives(state.initiatives, timeline);
    const { scheduledItems, hasCycle } = scheduleWorkItems(
      state.workItems,
      preparedInitiatives,
      timeline,
    );
    const preparedMilestones = prepareMilestones(
      state.milestones,
      preparedInitiatives,
      timeline,
    );
    const numberedItems = scheduledItems.map((item) => item);
    const sortedForNumbering = [...numberedItems].sort((left, right) => {
      if (left.initiativeId !== right.initiativeId) {
        return left.initiativeId.localeCompare(right.initiativeId);
      }

      if (left.startIndex !== right.startIndex) {
        return left.startIndex - right.startIndex;
      }

      return left.name.localeCompare(right.name);
    });
    const numberMap = new Map(
      sortedForNumbering.map((item, index) => [item.id, index + 1]),
    );
    const numberedScheduledItems = scheduledItems.map((item) => ({
      ...item,
      itemNumber: numberMap.get(item.id) || 0,
      dependencyItemNumbers: item.dependencyIds
        .map((dependencyId) => numberMap.get(dependencyId))
        .filter(Boolean),
    }));

    return {
      timeline,
      preparedInitiatives,
      scheduledItems: numberedScheduledItems,
      preparedMilestones,
      dependencyMap: buildDependencyMap(numberedScheduledItems),
      executiveSummaries: buildExecutiveSummaries(
        preparedInitiatives,
        numberedScheduledItems,
        preparedMilestones,
      ),
      uniqueThemes: Array.from(
        new Set(
          preparedInitiatives
            .map((initiative) => initiative.theme.trim())
            .filter(Boolean),
        ),
      ),
      hasCycle,
    };
  }, [state]);
  useEffect(() => {
    const maxIndex = Math.max(0, roadmapModel.timeline.length - 1);

    setVisibleStartIndex((current) => Math.min(current, maxIndex));
    setVisibleEndIndex(maxIndex);
  }, [roadmapModel.timeline.length]);

  const visibleTimeline = roadmapModel.timeline.slice(
    visibleStartIndex,
    visibleEndIndex + 1,
  );
  const timelineStyle = {
    "--month-count": Math.max(visibleTimeline.length, 1),
    "--timeline-width": "100%",
  };

  async function handleFileSelection(event) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, {
        type: "array",
        cellDates: true,
      });

      setPendingWorkbook(workbook);
      setSelectedFileName(file.name);
      setImportMessage("File ready. Click Generate Roadmap to build the view.");
    } catch {
      setPendingWorkbook(null);
      setSelectedFileName("");
      setImportMessage(
        "Import failed. Check that the workbook is a valid .xlsx file with row headers.",
      );
    }
  }

  function generateRoadmap() {
    if (!pendingWorkbook) {
      setImportMessage("Select an Excel file before generating the roadmap.");
      return;
    }

    setState((current) => ({
      ...buildStateFromWorkbook(pendingWorkbook, current),
      portfolioName: formatRoadmapTitleFromFilename(selectedFileName),
      activePage: "roadmap",
    }));
    setImportMessage(`Roadmap generated from ${selectedFileName}.`);
  }

  function handleVisibleStartChange(event) {
    const nextStart = Number.parseInt(event.target.value, 10) || 0;

    setVisibleStartIndex(nextStart);
    setVisibleEndIndex((current) => Math.max(current, nextStart));
  }

  function handleVisibleEndChange(event) {
    const nextEnd = Number.parseInt(event.target.value, 10) || 0;

    setVisibleEndIndex(nextEnd);
    setVisibleStartIndex((current) => Math.min(current, nextEnd));
  }

  function toggleInitiative(initiativeId) {
    setCollapsedInitiatives((current) => ({
      ...current,
      [initiativeId]: !(current[initiativeId] ?? true),
    }));
  }

  function exportJson() {
    downloadJsonFile(
      {
        metadata: {
          portfolioName: state.portfolioName,
          audience: state.audience,
          vision: state.vision,
        },
        inputs: {
          initiatives: state.initiatives,
          workItems: state.workItems,
          milestones: state.milestones,
        },
        generated: roadmapModel,
      },
      "delivery-roadmap-export.json",
    );
  }

  return (
    <div className="app-shell">
      <header className="hero-band">
        <div className="hero-copy">
          <p className="eyebrow">Delivery Roadmap Creator</p>
          <p className="lede">
            Add initiatives, work items, milestones, and dependencies through
            structured fields, then switch into a wide roadmap view built for
            leadership communication.
          </p>
        </div>
      </header>

      <div className="page-switcher">
        <button
          type="button"
          className={state.activePage === "input" ? "tab-button active" : "tab-button"}
          onClick={() => setState((current) => ({ ...current, activePage: "input" }))}
        >
          Input Page
        </button>
        <button
          type="button"
          className={state.activePage === "roadmap" ? "tab-button active" : "tab-button"}
          onClick={() => setState((current) => ({ ...current, activePage: "roadmap" }))}
        >
          Delivery Roadmap
        </button>
      </div>

      {state.activePage === "input" ? (
        <main className="input-layout upload-only-layout">
          <section className="panel input-panel upload-panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Excel Input</p>
                <h2>Upload your roadmap workbook</h2>
              </div>
              <button
                type="button"
                className="secondary-button"
                onClick={downloadExcelTemplate}
              >
                Download Template
              </button>
            </div>

            <p className="subtle-copy">
              Use one sheet per initiative. Only sheets whose names start with
              `Initiative` are imported. Expected columns: `Initiative`,
              `Initiative Narrative Theme`, `Item Name`, `Description`,
              `Start Date`, `End Date`, `Owner`, `Status`, `Milestone`,
              `Milestone Quarter`, `Dependencies`.
            </p>

            <label>
              Team
              <input
                type="text"
                value={state.teamName}
                onChange={(event) =>
                  setState((current) => ({ ...current, teamName: event.target.value }))
                }
                placeholder="Systems Team"
              />
            </label>

            <label className="upload-dropzone">
              <span className="upload-label">Select Excel File</span>
              <input type="file" accept=".xlsx,.xls" onChange={handleFileSelection} />
            </label>

            <div className="file-status-row">
              <span className="file-pill">
                {selectedFileName || "No file selected"}
              </span>
              <button
                type="button"
                className="primary-button"
                onClick={generateRoadmap}
              >
                Generate Roadmap
              </button>
            </div>

            {importMessage ? <p className="subtle-copy">{importMessage}</p> : null}
          </section>
        </main>
      ) : (
        <main className="roadmap-layout">
          <section className="panel roadmap-panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Delivery Roadmap</p>
                <h2>
                  {[
                    state.portfolioName || "",
                    state.teamName || "",
                    "Delivery Roadmap",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                </h2>
                <p className="subtle-copy">
                  {state.audience}
                </p>
              </div>

              <div className="action-row compact">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() =>
                    setState((current) => ({ ...current, activePage: "input" }))
                  }
                >
                  Back to Inputs
                </button>
                <button
                  type="button"
                  className={showDependencies ? "secondary-button toggled" : "secondary-button"}
                  onClick={() => setShowDependencies((current) => !current)}
                >
                  {showDependencies ? "Hide Dependencies" : "Show Dependencies"}
                </button>
                <button type="button" className="primary-button" onClick={exportJson}>
                  Export JSON
                </button>
              </div>
            </div>

            <div className="signal-strip">
              <div>
                <p className="signal-label">Planning Window</p>
                <strong>
                  {roadmapModel.timeline[0]?.label} to{" "}
                  {roadmapModel.timeline[roadmapModel.timeline.length - 1]?.label}
                </strong>
              </div>
              <div>
                <p className="signal-label">Overall Progress</p>
                <strong className={getProgressBadgeColor(calculatePortfolioProgress(roadmapModel.preparedInitiatives, state.workItems))}>
                  {calculatePortfolioProgress(roadmapModel.preparedInitiatives, state.workItems)}% average
                </strong>
              </div>
              <div>
                <p className="signal-label">Initiatives</p>
                <strong>{roadmapModel.preparedInitiatives.length}</strong>
              </div>
            </div>

            <div className="range-panel">
              <div>
                <p className="signal-label">Visible Range</p>
                <strong>
                  {visibleTimeline[0]?.label || "Start"} to{" "}
                  {visibleTimeline[visibleTimeline.length - 1]?.label || "End"}
                </strong>
              </div>
              <div className="slider-grid">
                <label>
                  <span>From</span>
                  <input
                    type="range"
                    min="0"
                    max={Math.max(0, roadmapModel.timeline.length - 1)}
                    value={visibleStartIndex}
                    onChange={handleVisibleStartChange}
                  />
                </label>
                <label>
                  <span>To</span>
                  <input
                    type="range"
                    min="0"
                    max={Math.max(0, roadmapModel.timeline.length - 1)}
                    value={visibleEndIndex}
                    onChange={handleVisibleEndChange}
                  />
                </label>
              </div>
            </div>

            <div className="timeline-scroll">
              <div className="timeline-board wide" style={timelineStyle}>
                <div className="timeline-header">
                  <div className="lane-label sticky-column">Initiative / Item</div>
                  <div className="month-grid">
                    {visibleTimeline.map((month) => (
                      <div key={month.label} className="month-cell">
                        <span>{month.shortLabel}</span>
                        <small>{month.quarter}</small>
                      </div>
                    ))}
                  </div>
                </div>

                {roadmapModel.preparedInitiatives.map((initiative) => {
                  const items = roadmapModel.scheduledItems.filter(
                    (item) => item.initiative?.id === initiative.id,
                  );
                  const completedCount = items.filter(
                    (item) => item.status === "Done",
                  ).length;
                  const visibleItems = items.filter(
                    (item) =>
                      item.displayEndIndex >= visibleStartIndex &&
                      item.startIndex <= visibleEndIndex,
                  );
                  const isCollapsed = collapsedInitiatives[initiative.id] ?? true;

                  return (
                    <section
                      className={`initiative-lane ${isCollapsed ? "collapsed" : ""}`}
                      key={initiative.id}
                    >
                      <button
                        type="button"
                        className="initiative-toggle"
                        onClick={() => toggleInitiative(initiative.id)}
                      >
                        <div className="sticky-column initiative-label">
                          <p>{initiative.name || "Untitled initiative"}</p>
                          <span className={`initiative-progress ${getProgressBadgeColor(calculateInitiativeProgress(items))}`}>
                            {calculateInitiativeProgress(items)}% avg progress
                          </span>
                        </div>
                        <span className={`chevron ${isCollapsed ? "" : "open"}`}>
                          ▾
                        </span>
                      </button>

                      {!isCollapsed ? (
                        <div className="lane-rows">
                          {visibleItems.map((item) => {
                          const isExpanded = expandedItemId === item.id;
                          const visibleBarStart = Math.max(item.startIndex, visibleStartIndex);
                          const visibleBarEnd = Math.min(item.displayEndIndex, visibleEndIndex);

                          return (
                            <div className="item-shell" key={item.id}>
                              <button
                                type="button"
                                className={`item-row item-row-button ${isExpanded ? "expanded" : ""}`}
                                onClick={() =>
                                  setExpandedItemId((current) =>
                                    current === item.id ? "" : item.id,
                                  )
                                }
                              >
                                <div className="sticky-column item-meta compact">
                                  <strong>
                                    {item.itemNumber}. {item.name || "Unnamed work item"}
                                  </strong>
                                </div>

                                <div className="roadmap-track">
                                  <div className="month-grid track-grid">
                                    <div
                                      className={`timeline-span ${item.atRisk ? "risk" : ""} ${
                                        item.status === "Done" ? "done" : ""
                                      } ${item.status === "In Progress" ? "progress" : ""}`}
                                      style={{
                                        gridColumn: `${visibleBarStart - visibleStartIndex + 1} / ${
                                          visibleBarEnd - visibleStartIndex + 2
                                        }`,
                                      }}
                                    >
                                      <span className="span-title">
                                        {roadmapModel.timeline[item.startIndex]?.shortLabel || "Start"} -{" "}
                                        {roadmapModel.timeline[item.displayEndIndex]?.shortLabel || "End"}
                                      </span>
                                      {roadmapModel.preparedMilestones.some(
                                        (milestone) => milestone.itemId === item.id,
                                      ) ? (
                                        <span className="milestone-inline-indicator" />
                                      ) : null}
                                      <span className="span-status">{item.status}</span>
                                    </div>
                                    <div
                                      className="progress-bar-container"
                                      style={{
                                        gridColumn: `${visibleBarStart - visibleStartIndex + 1} / ${
                                          visibleBarEnd - visibleStartIndex + 2
                                        }`,
                                      }}
                                    >
                                      <div className="progress-bar">
                                        <div
                                          className="progress-bar-fill"
                                          style={{ width: `${item.progress || 0}%` }}
                                        >
                                          {(item.progress || 0) > 10 && (
                                            <span className="progress-percentage">{item.progress || 0}%</span>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                    {showDependencies && item.dependencyNames.length > 0 ? (
                                      <div
                                        className="dependency-inline"
                                        style={{
                                          gridColumn: `1 / ${
                                            Math.max(
                                              2,
                                              visibleBarStart - visibleStartIndex + 1,
                                            )
                                          }`,
                                        }}
                                      >
                                        <span className="dependency-inline-line" />
                                        <span className="dependency-inline-pill">
                                          Depends on{" "}
                                          {item.dependencyItemNumbers.length > 0
                                            ? item.dependencyItemNumbers.join(", ")
                                            : item.dependencyNames.length}
                                        </span>
                                      </div>
                                    ) : null}
                                  </div>
                                </div>
                              </button>

                              {isExpanded ? (
                                <div className="item-detail-panel">
                                  <span>{item.owner || "Owner pending"}</span>
                                  <span>{item.status}</span>
                                  <span>
                                    {roadmapModel.timeline[item.startIndex]?.label || "Start pending"} to{" "}
                                    {roadmapModel.timeline[item.displayEndIndex]?.label || "End pending"}
                                  </span>
                                  <span>
                                    {item.dependencyNames.length > 0
                                      ? `Depends on: ${
                                          item.dependencyItemNumbers.length > 0
                                            ? item.dependencyItemNumbers.join(", ")
                                            : item.dependencyNames.join(", ")
                                        }`
                                      : "No blockers"}
                                  </span>
                                  <div className="progress-control-wrapper">
                                    <label>
                                      Progress: {item.progress || 0}%
                                      <input
                                        type="range"
                                        min="0"
                                        max="100"
                                        value={item.progress || 0}
                                        onChange={(event) =>
                                          updateWorkItem(item.id, "progress", Number.parseInt(event.target.value, 10))
                                        }
                                        className="progress-slider"
                                      />
                                    </label>
                                  </div>
                                  {roadmapModel.preparedMilestones
                                    .filter((milestone) => milestone.itemId === item.id)
                                    .map((milestone) => (
                                      <span key={milestone.id} className="milestone-pill">
                                        Milestone: {milestone.label} ({milestone.quarter})
                                      </span>
                                    ))}
                                  {item.description ? (
                                    <p className="detail-description">{item.description}</p>
                                  ) : null}
                                </div>
                              ) : null}
                            </div>
                          );
                          })}
                          {visibleItems.length === 0 ? (
                            <p className="empty-copy compact-empty">
                              No active items in the selected month range.
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                    </section>
                  );
                })}
              </div>
            </div>
          </section>

          <section className="panel dependency-panel">
            <button
              type="button"
              className="section-toggle"
              onClick={() => setDependencyPanelOpen((current) => !current)}
            >
              <div>
                <p className="eyebrow">Dependency Map</p>
                <h2>Execution sequencing</h2>
              </div>
              <span className={`chevron ${dependencyPanelOpen ? "open" : ""}`}>▾</span>
            </button>

            {dependencyPanelOpen ? (
              <div className="dependency-grid">
                {roadmapModel.dependencyMap.length > 0 ? (
                  roadmapModel.dependencyMap.map((link) => (
                    <article className="dependency-card" key={link.id}>
                      <span className="dependency-pill">{link.from}</span>
                      <span className="dependency-arrow">leads to</span>
                      <span className="dependency-pill target">{link.to}</span>
                      <p>{link.note}</p>
                    </article>
                  ))
                ) : (
                  <p className="empty-copy">
                    Add dependencies in Excel or the input page to populate the dependency map.
                  </p>
                )}
              </div>
            ) : null}
          </section>

          <section className="panel summary-panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Executive Summary</p>
                <h2>Executive Summary</h2>
              </div>
            </div>

            <div className="summary-stack">
              {roadmapModel.executiveSummaries.map((summary) => (
                <article className="summary-card" key={summary.id}>
                  {summary.theme ? (
                    <p className="summary-kicker">{summary.theme}</p>
                  ) : null}
                  <h3>{summary.title}</h3>
                  <ul>
                    {summary.bullets.map((bullet) => (
                      <li key={bullet}>{bullet}</li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </section>
        </main>
      )}
    </div>
  );
}

export default App;
