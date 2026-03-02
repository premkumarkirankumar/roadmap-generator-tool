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
  portfolioName: "FY26 Delivery Roadmap",
  audience: "Delivery leadership and cross-functional stakeholders",
  vision:
    "Add initiatives, work items, and milestones through structured inputs, then convert them into a leadership-ready delivery roadmap.",
  initiatives: [
    {
      id: "initiative-1",
      name: "Delivery Foundation",
      startDate: "2026-01-15",
      endDate: "2026-06-30",
      theme: "Quality",
      narrative:
        "Establish a stable operating backbone for roadmap planning, sequencing, and executive reporting.",
    },
    {
      id: "initiative-2",
      name: "Automation Scale-Up",
      startDate: "2026-03-01",
      endDate: "2026-09-30",
      theme: "DevOps",
      narrative:
        "Expand automation and release confidence once the delivery foundation is in place.",
    },
  ],
  workItems: [
    {
      id: "item-1",
      initiativeId: "initiative-1",
      name: "Dependency model",
      owner: "PMO",
      startDate: "2026-01-15",
      endDate: "2026-02-28",
      duration: "2",
      status: "In Progress",
      dependencyIds: [],
    },
    {
      id: "item-2",
      initiativeId: "initiative-1",
      name: "Executive roadmap shell",
      owner: "Delivery Lead",
      startDate: "2026-02-10",
      endDate: "2026-04-30",
      duration: "2",
      status: "Planned",
      dependencyIds: ["item-1"],
    },
    {
      id: "item-3",
      initiativeId: "initiative-2",
      name: "Release governance dashboard",
      owner: "Engineering Manager",
      startDate: "2026-05-01",
      endDate: "2026-06-30",
      duration: "2",
      status: "Planned",
      dependencyIds: ["item-2"],
    },
  ],
  milestones: [
    {
      id: "milestone-1",
      initiativeId: "initiative-1",
      date: "2026-03-20",
      label: "Leadership-ready roadmap draft",
    },
    {
      id: "milestone-2",
      initiativeId: "initiative-2",
      date: "2026-09-15",
      label: "Scaled release governance rollout",
    },
  ],
};

function buildId(prefix, index) {
  return `${prefix}-${Date.now()}-${index}`;
}

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
    .flatMap((item) =>
      item.dependencyIds.map((dependencyId) => {
        const dependency = itemMap.get(dependencyId);

        if (!dependency) {
          return null;
        }

        const crossInitiative =
          dependency.initiative?.id !== item.initiative?.id && dependency.initiative && item.initiative;

        return {
          id: `${dependencyId}-${item.id}`,
          from: dependency.name,
          to: item.name,
          note: crossInitiative
            ? `${dependency.initiative.name} -> ${item.initiative.name}`
            : `${dependency.name} completes before ${item.name} can advance.`,
        };
      }),
    )
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

function buildStateFromWorkbook(workbook, currentState) {
  const sheets = workbook.SheetNames.map((sheetName, sheetIndex) => {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, {
      defval: "",
      raw: true,
      blankrows: false,
    });
    const itemRows = rows.filter((row) =>
      String(getRowValue(row, ["item", "itemname", "workitem", "workitemname"])).trim(),
    );
    const rowDates = itemRows
      .flatMap((row) => [
        normalizeExcelDate(getRowValue(row, ["startdate", "start"])),
        normalizeExcelDate(getRowValue(row, ["enddate", "end"])),
      ])
      .filter(Boolean)
      .map((value) => parseDateInput(value))
      .filter(Boolean)
      .sort((left, right) => left.getTime() - right.getTime());
    const firstStart = rowDates[0] ? formatDateInput(rowDates[0]) : "";
    const lastEnd = rowDates[rowDates.length - 1]
      ? formatDateInput(rowDates[rowDates.length - 1])
      : firstStart;
    const initiativeStart =
      normalizeExcelDate(
        getRowValue(rows[0] || {}, [
          "initiativestart",
          "sheetstart",
          "startdate",
        ]),
      ) || firstStart;
    const initiativeEnd =
      normalizeExcelDate(
        getRowValue(rows[0] || {}, ["initiativeend", "sheetend", "enddate"]),
      ) || lastEnd || initiativeStart;
    const theme =
      String(getRowValue(rows[0] || {}, ["theme", "initiativetheme"])).trim() ||
      "Theme pending";
    const narrative =
      String(
        getRowValue(rows[0] || {}, ["narrative", "initiativenarrative", "description"]),
      ).trim() || `Imported from sheet "${sheetName}".`;
    const initiativeId = `initiative-import-${sheetIndex + 1}`;

    return {
      sheetName,
      initiative: {
        id: initiativeId,
        name: sheetName,
        startDate: initiativeStart,
        endDate: initiativeEnd,
        theme,
        narrative,
      },
      rows,
      itemRows,
    };
  });

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
      const startDate = normalizeExcelDate(getRowValue(row, ["startdate", "start"]));
      const endDate = normalizeExcelDate(getRowValue(row, ["enddate", "end"]));
      const durationValue = String(
        getRowValue(row, ["duration", "durationmonths", "months"]),
      ).trim();
      const item = {
        id: itemId,
        initiativeId: sheetEntry.initiative.id,
        name: itemName,
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
      };
      const dependencyText = String(
        getRowValue(row, ["dependencies", "dependency", "dependson"]),
      ).trim();

      workItems.push(item);
      itemLookup.set(
        `${sheetEntry.sheetName.toLowerCase()}::${itemName.toLowerCase()}`,
        itemId,
      );

      if (dependencyText) {
        pendingDependencies.push({
          initiativeName: sheetEntry.sheetName,
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
      const milestoneDate = normalizeExcelDate(
        getRowValue(row, ["milestonedate", "milestonewhen"]),
      );

      if (milestoneLabel && milestoneDate) {
        milestones.push({
          id: `milestone-import-${sheetIndex + 1}-${rowIndex + 1}`,
          initiativeId: sheetEntry.initiative.id,
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
  });

  return {
    ...currentState,
    activePage: "input",
    initiatives: initiatives.length > 0 ? initiatives : currentState.initiatives,
    workItems: workItems.length > 0 ? workItems : currentState.workItems,
    milestones,
  };
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

function createEmptyInitiative(index) {
  return {
    id: buildId("initiative", index),
    name: "",
    startDate: "",
    endDate: "",
    theme: "",
    narrative: "",
  };
}

function createEmptyWorkItem(index, initiativeId) {
  return {
    id: buildId("item", index),
    initiativeId: initiativeId || "",
    name: "",
    owner: "",
    startDate: "",
    endDate: "",
    duration: "1",
    status: "Planned",
    dependencyIds: [],
  };
}

function createEmptyMilestone(index, initiativeId) {
  return {
    id: buildId("milestone", index),
    initiativeId: initiativeId || "",
    date: "",
    label: "",
  };
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
          ? parsed.workItems
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

    return {
      timeline,
      preparedInitiatives,
      scheduledItems,
      preparedMilestones,
      dependencyMap: buildDependencyMap(scheduledItems),
      executiveSummaries: buildExecutiveSummaries(
        preparedInitiatives,
        scheduledItems,
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

  const timelineStyle = {
    "--month-count": roadmapModel.timeline.length,
    "--timeline-width": `${Math.max(roadmapModel.timeline.length * 132, 960)}px`,
  };

  function updateRootField(event) {
    const { name, value } = event.target;
    setState((current) => ({ ...current, [name]: value }));
  }

  function updateInitiative(initiativeId, field, value) {
    setState((current) => ({
      ...current,
      initiatives: current.initiatives.map((initiative) =>
        initiative.id === initiativeId ? { ...initiative, [field]: value } : initiative,
      ),
    }));
  }

  function updateWorkItem(itemId, field, value) {
    setState((current) => ({
      ...current,
      workItems: current.workItems.map((item) =>
        item.id === itemId ? { ...item, [field]: value } : item,
      ),
    }));
  }

  function updateWorkItemDependencies(itemId, values) {
    setState((current) => ({
      ...current,
      workItems: current.workItems.map((item) =>
        item.id === itemId ? { ...item, dependencyIds: values } : item,
      ),
    }));
  }

  function updateMilestone(milestoneId, field, value) {
    setState((current) => ({
      ...current,
      milestones: current.milestones.map((milestone) =>
        milestone.id === milestoneId ? { ...milestone, [field]: value } : milestone,
      ),
    }));
  }

  function addInitiative() {
    setState((current) => ({
      ...current,
      initiatives: [
        ...current.initiatives,
        createEmptyInitiative(current.initiatives.length + 1),
      ],
    }));
  }

  function addWorkItem() {
    setState((current) => ({
      ...current,
      workItems: [
        ...current.workItems,
        createEmptyWorkItem(current.workItems.length + 1, current.initiatives[0]?.id || ""),
      ],
    }));
  }

  function addMilestone() {
    setState((current) => ({
      ...current,
      milestones: [
        ...current.milestones,
        createEmptyMilestone(current.milestones.length + 1, current.initiatives[0]?.id || ""),
      ],
    }));
  }

  function removeInitiative(initiativeId) {
    setState((current) => ({
      ...current,
      initiatives: current.initiatives.filter((initiative) => initiative.id !== initiativeId),
      workItems: current.workItems
        .filter((item) => item.initiativeId !== initiativeId)
        .map((item) => ({
          ...item,
          dependencyIds: item.dependencyIds.filter((dependencyId) =>
            current.workItems.some(
              (candidate) =>
                candidate.id !== item.id &&
                candidate.id === dependencyId &&
                candidate.initiativeId !== initiativeId,
            ),
          ),
        })),
      milestones: current.milestones.filter(
        (milestone) => milestone.initiativeId !== initiativeId,
      ),
    }));
  }

  function removeWorkItem(itemId) {
    setState((current) => ({
      ...current,
      workItems: current.workItems
        .filter((item) => item.id !== itemId)
        .map((item) => ({
          ...item,
          dependencyIds: item.dependencyIds.filter((dependencyId) => dependencyId !== itemId),
        })),
    }));
  }

  function removeMilestone(milestoneId) {
    setState((current) => ({
      ...current,
      milestones: current.milestones.filter((milestone) => milestone.id !== milestoneId),
    }));
  }

  function resetToSample() {
    setState(defaultState);
    setImportMessage("");
  }

  async function importFromExcel(event) {
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

      setState((current) => buildStateFromWorkbook(workbook, current));
      setImportMessage(
        `Imported ${workbook.SheetNames.length} initiative sheet${workbook.SheetNames.length === 1 ? "" : "s"} from ${file.name}.`,
      );
    } catch {
      setImportMessage(
        "Import failed. Check that the workbook is a valid .xlsx file with row headers.",
      );
    }

    event.target.value = "";
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
          <h1>Build a sleek delivery roadmap from clear inputs.</h1>
          <p className="lede">
            Import initiatives from Excel sheets or edit them directly, then
            switch to a wide roadmap view built for leadership communication.
          </p>
        </div>

        <div className="hero-card">
          <p className="hero-label">Delivery Roadmap</p>
          <strong>{state.activePage === "input" ? "Input Page" : "Delivery Roadmap"}</strong>
          <p>
            Excel sheets map to initiatives automatically. Use
            `Other Initiative::Work Item` for cross-initiative dependencies.
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
        <main className="input-layout">
          <section className="panel input-panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Portfolio Setup</p>
                <h2>Roadmap details</h2>
              </div>
              <button type="button" className="secondary-button" onClick={resetToSample}>
                Reset sample
              </button>
            </div>

            <div className="meta-grid">
              <label>
                Portfolio Name
                <input
                  name="portfolioName"
                  value={state.portfolioName}
                  onChange={updateRootField}
                />
              </label>

              <label>
                Audience
                <input name="audience" value={state.audience} onChange={updateRootField} />
              </label>
            </div>

            <label>
              Vision Statement
              <textarea
                name="vision"
                value={state.vision}
                onChange={updateRootField}
                rows="3"
              />
            </label>

            <section className="input-section">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Excel Import</p>
                  <h3>Load initiatives from workbook sheets</h3>
                </div>
              </div>

              <label>
                Import `.xlsx`
                <input type="file" accept=".xlsx,.xls" onChange={importFromExcel} />
              </label>

              <p className="subtle-copy">
                Each sheet becomes one initiative. Expected row headers:
                `Item`, `Start Date`, `End Date`, `Dependencies`, optional
                `Owner`, `Status`, `Theme`, `Narrative`, `Milestone`,
                `Milestone Date`.
              </p>
              <p className="subtle-copy">
                Dependency format: use `Work Item Name` for same-sheet
                dependencies, or `Other Initiative::Work Item Name` for
                dependencies across sheets.
              </p>
              {importMessage ? <p className="subtle-copy">{importMessage}</p> : null}
            </section>

            <section className="input-section">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Initiatives</p>
                  <h3>Names, dates, theme, narrative</h3>
                </div>
                <button type="button" className="primary-button" onClick={addInitiative}>
                  Add Initiative
                </button>
              </div>

              <div className="card-stack">
                {state.initiatives.map((initiative, index) => {
                  const startDate = parseDateInput(initiative.startDate);
                  const endDate = parseDateInput(initiative.endDate);

                  return (
                    <article className="entry-card" key={initiative.id}>
                      <div className="card-topline">
                        <strong>Initiative {index + 1}</strong>
                        {state.initiatives.length > 1 ? (
                          <button
                            type="button"
                            className="ghost-button"
                            onClick={() => removeInitiative(initiative.id)}
                          >
                            Remove
                          </button>
                        ) : null}
                      </div>

                      <div className="entry-grid initiative-grid">
                        <label>
                          Name
                          <input
                            value={initiative.name}
                            onChange={(event) =>
                              updateInitiative(initiative.id, "name", event.target.value)
                            }
                          />
                        </label>

                        <label>
                          Theme
                          <input
                            value={initiative.theme}
                            onChange={(event) =>
                              updateInitiative(initiative.id, "theme", event.target.value)
                            }
                          />
                        </label>

                        <label>
                          Start Date
                          <input
                            type="date"
                            value={initiative.startDate}
                            onChange={(event) =>
                              updateInitiative(initiative.id, "startDate", event.target.value)
                            }
                          />
                        </label>

                        <label>
                          End Date
                          <input
                            type="date"
                            value={initiative.endDate}
                            onChange={(event) =>
                              updateInitiative(initiative.id, "endDate", event.target.value)
                            }
                          />
                        </label>
                      </div>

                      <label>
                        Narrative
                        <textarea
                          value={initiative.narrative}
                          onChange={(event) =>
                            updateInitiative(initiative.id, "narrative", event.target.value)
                          }
                          rows="3"
                        />
                      </label>

                      <div className="date-note">
                        <span>{startDate ? getQuarterLabel(startDate) : "Quarter pending"}</span>
                        <span>{endDate ? getQuarterLabel(endDate) : "Quarter pending"}</span>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>

            <section className="input-section">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Work Items</p>
                  <h3>Structured execution inputs</h3>
                </div>
                <button type="button" className="primary-button" onClick={addWorkItem}>
                  Add Work Item
                </button>
              </div>

              <div className="card-stack">
                {state.workItems.map((item, index) => (
                  <article className="entry-card" key={item.id}>
                    <div className="card-topline">
                      <strong>Work Item {index + 1}</strong>
                      {state.workItems.length > 1 ? (
                        <button
                          type="button"
                          className="ghost-button"
                          onClick={() => removeWorkItem(item.id)}
                        >
                          Remove
                        </button>
                      ) : null}
                    </div>

                    <div className="entry-grid work-item-grid">
                      <label>
                        Initiative
                        <select
                          value={item.initiativeId}
                          onChange={(event) =>
                            updateWorkItem(item.id, "initiativeId", event.target.value)
                          }
                        >
                          {state.initiatives.map((initiative) => (
                            <option key={initiative.id} value={initiative.id}>
                              {initiative.name || "Untitled initiative"}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label>
                        Item Name
                        <input
                          value={item.name}
                          onChange={(event) =>
                            updateWorkItem(item.id, "name", event.target.value)
                          }
                        />
                      </label>

                      <label>
                        Owner
                        <input
                          value={item.owner}
                          onChange={(event) =>
                            updateWorkItem(item.id, "owner", event.target.value)
                          }
                        />
                      </label>

                      <label>
                        Status
                        <select
                          value={item.status}
                          onChange={(event) =>
                            updateWorkItem(item.id, "status", event.target.value)
                          }
                        >
                          {STATUS_OPTIONS.map((status) => (
                            <option key={status} value={status}>
                              {status}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label>
                        Start Date
                        <input
                          type="date"
                          value={item.startDate}
                          onChange={(event) =>
                            updateWorkItem(item.id, "startDate", event.target.value)
                          }
                        />
                      </label>

                      <label>
                        End Date
                        <input
                          type="date"
                          value={item.endDate}
                          onChange={(event) =>
                            updateWorkItem(item.id, "endDate", event.target.value)
                          }
                        />
                      </label>

                      <label>
                        Duration (months)
                        <input
                          type="number"
                          min="1"
                          value={item.duration}
                          onChange={(event) =>
                            updateWorkItem(item.id, "duration", event.target.value)
                          }
                        />
                      </label>
                    </div>

                    <label>
                      Dependencies
                      <select
                        multiple
                        value={item.dependencyIds}
                        onChange={(event) =>
                          updateWorkItemDependencies(
                            item.id,
                            Array.from(event.target.selectedOptions, (option) => option.value),
                          )
                        }
                        className="multi-select"
                      >
                        {state.workItems
                          .filter((candidate) => candidate.id !== item.id)
                          .map((candidate) => {
                            const initiativeName =
                              state.initiatives.find(
                                (initiative) => initiative.id === candidate.initiativeId,
                              )?.name || "Initiative";

                            return (
                              <option key={candidate.id} value={candidate.id}>
                                {initiativeName} :: {candidate.name || "Unnamed work item"}
                              </option>
                            );
                          })}
                      </select>
                    </label>
                  </article>
                ))}
              </div>
            </section>

            <section className="input-section">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Milestones</p>
                  <h3>Quarter signals</h3>
                </div>
                <button type="button" className="primary-button" onClick={addMilestone}>
                  Add Milestone
                </button>
              </div>

              <div className="card-stack">
                {state.milestones.map((milestone, index) => (
                  <article className="entry-card" key={milestone.id}>
                    <div className="card-topline">
                      <strong>Milestone {index + 1}</strong>
                      {state.milestones.length > 1 ? (
                        <button
                          type="button"
                          className="ghost-button"
                          onClick={() => removeMilestone(milestone.id)}
                        >
                          Remove
                        </button>
                      ) : null}
                    </div>

                    <div className="entry-grid milestone-grid">
                      <label>
                        Initiative
                        <select
                          value={milestone.initiativeId}
                          onChange={(event) =>
                            updateMilestone(milestone.id, "initiativeId", event.target.value)
                          }
                        >
                          {state.initiatives.map((initiative) => (
                            <option key={initiative.id} value={initiative.id}>
                              {initiative.name || "Untitled initiative"}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label>
                        Milestone Date
                        <input
                          type="date"
                          value={milestone.date}
                          onChange={(event) =>
                            updateMilestone(milestone.id, "date", event.target.value)
                          }
                        />
                      </label>

                      <label>
                        Label
                        <input
                          value={milestone.label}
                          onChange={(event) =>
                            updateMilestone(milestone.id, "label", event.target.value)
                          }
                        />
                      </label>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </section>

          <aside className="panel side-panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Input Summary</p>
                <h2>Imported structure</h2>
              </div>
            </div>

            <div className="summary-metric-grid">
              <div className="metric-card">
                <span>Sheets / Initiatives</span>
                <strong>{state.initiatives.length}</strong>
              </div>
              <div className="metric-card">
                <span>Work Items</span>
                <strong>{state.workItems.length}</strong>
              </div>
              <div className="metric-card">
                <span>Milestones</span>
                <strong>{state.milestones.length}</strong>
              </div>
              <div className="metric-card">
                <span>Themes</span>
                <strong>{roadmapModel.uniqueThemes.length}</strong>
              </div>
            </div>

            <div className="theme-stack">
              <p className="eyebrow">Theme Library</p>
              <div className="badge-row">
                {roadmapModel.uniqueThemes.length > 0 ? (
                  roadmapModel.uniqueThemes.map((theme) => (
                    <span className="theme-pill" key={theme}>
                      {theme}
                    </span>
                  ))
                ) : (
                  <span className="theme-pill muted-pill">Add themes in Excel or manually</span>
                )}
              </div>
            </div>

            <div className="preview-card">
              <p className="hero-label">Auto-detected timeline</p>
              <strong>
                {roadmapModel.timeline[0]?.label} to{" "}
                {roadmapModel.timeline[roadmapModel.timeline.length - 1]?.label}
              </strong>
              <p>
                Initiative dates come from each sheet name plus imported row
                dates. You can adjust them after import.
              </p>
            </div>

            <div className="action-row">
              <button type="button" className="secondary-button" onClick={exportJson}>
                Export JSON
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={() =>
                  setState((current) => ({ ...current, activePage: "roadmap" }))
                }
              >
                Open Roadmap
              </button>
            </div>
          </aside>
        </main>
      ) : (
        <main className="roadmap-layout">
          <section className="panel roadmap-panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Delivery Roadmap</p>
                <h2>{state.portfolioName}</h2>
                <p className="subtle-copy">{state.audience}</p>
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
                <p className="signal-label">Execution Health</p>
                <strong>
                  {roadmapModel.hasCycle ? "Dependency conflict detected" : "Sequencing ready"}
                </strong>
              </div>
              <div>
                <p className="signal-label">Themes</p>
                <strong>{roadmapModel.uniqueThemes.join(", ") || "No themes yet"}</strong>
              </div>
            </div>

            <div className="timeline-scroll">
              <div className="timeline-board wide" style={timelineStyle}>
                <div className="timeline-header">
                  <div className="lane-label sticky-column">Initiative / Item</div>
                  <div className="month-grid">
                    {roadmapModel.timeline.map((month) => (
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
                  const milestones = roadmapModel.preparedMilestones.filter(
                    (milestone) => milestone.initiative?.id === initiative.id,
                  );

                  return (
                    <section className="initiative-lane" key={initiative.id}>
                      <div className="sticky-column initiative-label">
                        <p>{initiative.name || "Untitled initiative"}</p>
                        <span>{initiative.theme || "Theme pending"}</span>
                        <small>{initiative.quarterRange}</small>
                        <em>{initiative.narrative || "Narrative pending"}</em>
                      </div>

                      <div className="lane-rows">
                        {items.map((item) => (
                          <div className="item-row" key={item.id}>
                            <div className="sticky-column item-meta">
                              <strong>{item.name || "Unnamed work item"}</strong>
                              <span>
                                {item.owner || "Owner pending"} | {item.status}
                              </span>
                              <small>
                                {item.dependencyNames.length > 0
                                  ? `Depends on: ${item.dependencyNames.join(", ")}`
                                  : "No blockers"}
                              </small>
                            </div>

                            <div className="month-grid">
                              {roadmapModel.timeline.map((month) => {
                                const active =
                                  month.index >= item.startIndex &&
                                  month.index <= item.displayEndIndex;
                                const milestone = milestones.find(
                                  (entry) => entry.monthIndex === month.index,
                                );

                                return (
                                  <div
                                    key={`${item.id}-${month.label}`}
                                    className={`bar-cell ${active ? "active" : ""} ${
                                      item.atRisk ? "risk" : ""
                                    }`}
                                  >
                                    {active ? <span className="bar-fill">{item.status}</span> : null}
                                    {milestone ? (
                                      <span
                                        className="milestone-dot"
                                        title={milestone.label}
                                        aria-label={milestone.label}
                                      />
                                    ) : null}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>
                  );
                })}
              </div>
            </div>
          </section>

          <section className="panel dependency-panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Dependency Map</p>
                <h2>Execution sequencing</h2>
              </div>
            </div>

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
          </section>

          <section className="panel summary-panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Executive Summary</p>
                <h2>Leadership narrative</h2>
              </div>
            </div>

            <div className="summary-stack">
              {roadmapModel.executiveSummaries.map((summary) => (
                <article className="summary-card" key={summary.id}>
                  <p className="summary-kicker">{summary.theme}</p>
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
