import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import {
  isSharedStorageConfigured,
  loadSharedRoadmapMeta,
  loadSharedRoadmapState,
  saveSharedRoadmapState,
  signInToSharedMode,
  signOutFromSharedMode,
  subscribeToSharedAuth,
} from "./sharedState";
import "./App.css";

const STORAGE_KEY = "delivery-roadmap-creator-v3";
const STATUS_OPTIONS = ["Planned", "In Progress", "At Risk", "Blocked", "Done"];
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
const SHARED_ROADMAP_SLOTS = [
  {
    key: "systems-team",
    label: "Systems Team Roadmap",
    teamName: "Systems Team",
    fixed: true,
  },
  {
    key: "production-support-team",
    label: "Production Support Team Roadmap",
    teamName: "Production Support Team",
    fixed: true,
  },
  {
    key: "custom-team",
    label: "New Team Preview",
    teamName: "",
    fixed: false,
  },
];

const defaultState = {
  activePage: "landing",
  portfolioName: "Delivery Roadmap",
  teamName: "",
  audience: "Delivery leadership and cross-functional stakeholders",
  vision:
    "Add initiatives, work items, and milestones through structured inputs, then convert them into a leadership-ready delivery roadmap.",
  initiatives: [],
  workItems: [],
  milestones: [],
  importDiff: null,
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
  const normalized = String(status || "").trim().toLowerCase();

  if (normalized === "blocked") {
    return "Blocked";
  }

  if (atRisk) {
    return "At Risk";
  }

  if (normalized === "completed" || normalized === "done") {
    return "Done";
  }

  if (normalized === "doing" || normalized === "in progress") {
    return "In Progress";
  }

  if (normalized === "at risk") {
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
    const blocked = String(item.status || "").trim().toLowerCase() === "blocked";
    const atRisk = beyondInitiative || beyondHorizon || circularDependency || blocked;
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
      blocked,
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
            from: `${dependency.itemNumber || "?"}. ${dependency.name}`,
            to: `${item.itemNumber || "?"}. ${item.name}`,
            note: crossInitiative
              ? `${dependency.initiative.name} -> ${item.initiative.name}`
              : `${dependency.name} completes before ${item.name} can advance.`,
          };
        });
      }

      return (item.dependencyRefs || []).map((reference, index) => ({
        id: `raw-${item.id}-${index}`,
        from: reference,
        to: `${item.itemNumber || "?"}. ${item.name}`,
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
    const initiativeProgress = calculateInitiativeProgress(items);
    const risks = items.filter((item) => item.atRisk);
    const blockedItems = items.filter((item) => item.status === "Blocked");
    const nowItem = items[0];
    const nextItem = items[1];
    const completedCount = items.filter((item) => item.status === "Done").length;
    const milestoneHighlights = milestones.slice(0, 2);

    return {
      id: initiative.id,
      title: initiative.name,
      theme: initiative.theme,
      bullets: [
        items.length > 0
          ? `${initiativeProgress}% complete across ${items.length} items, with ${completedCount} delivered.`
          : "No work items imported yet.",
        nowItem
          ? `Current focus: ${nowItem.name}.${nextItem ? ` Next up: ${nextItem.name}.` : ""}`
          : "Add work items to generate the current focus.",
        blockedItems.length > 0
          ? `Blocked: ${blockedItems[0].name}${blockedItems[0].blockers ? ` (${blockedItems[0].blockers})` : ""}.`
          : risks.length > 0
            ? `Watchpoint: ${risks[0].name} needs attention due to timeline or dependency pressure.`
            : "No active blockers. Execution is sequenced cleanly.",
        milestoneHighlights.length > 0
          ? `Milestones: ${milestoneHighlights
              .map((milestone) => `${milestone.quarter} - ${milestone.label}`)
              .join(" | ")}`
          : "No milestones recorded yet.",
      ],
    };
  });
}

function getTrackingKey(item) {
  const externalId = String(item?.externalId || "").trim();

  if (externalId) {
    return `id:${externalId.toLowerCase()}`;
  }

  const initiativeName = String(item?.initiativeName || "").trim().toLowerCase();
  const itemName = String(item?.name || "").trim().toLowerCase();

  return `${initiativeName}::${itemName}`;
}

function compareImportStates(previousItems, nextItems) {
  const previousList = Array.isArray(previousItems) ? previousItems : [];
  const nextList = Array.isArray(nextItems) ? nextItems : [];
  const previousMap = new Map(previousList.map((item) => [getTrackingKey(item), item]));
  const nextMap = new Map(nextList.map((item) => [getTrackingKey(item), item]));
  const added = [];
  const removed = [];
  const updated = [];
  let statusChanges = 0;
  let progressChanges = 0;

  nextMap.forEach((item, key) => {
    if (!previousMap.has(key)) {
      added.push(item);
      return;
    }

    const previousItem = previousMap.get(key);
    const changedFields = [];

    [
      ["name", previousItem.name, item.name],
      ["initiative", previousItem.initiativeName, item.initiativeName],
      ["status", previousItem.status, item.status],
      ["progress", previousItem.progress, item.progress],
      ["startDate", previousItem.startDate, item.startDate],
      ["endDate", previousItem.endDate, item.endDate],
      ["blockers", previousItem.blockers, item.blockers],
      ["notes", previousItem.notes, item.notes],
    ].forEach(([field, left, right]) => {
      if (String(left || "").trim() !== String(right || "").trim()) {
        changedFields.push(field);
      }
    });

    if (changedFields.length > 0) {
      if (changedFields.includes("status")) {
        statusChanges += 1;
      }

      if (changedFields.includes("progress")) {
        progressChanges += 1;
      }

      updated.push({
        name: item.name,
        initiativeName: item.initiativeName,
        changedFields,
      });
    }
  });

  previousMap.forEach((item, key) => {
    if (!nextMap.has(key)) {
      removed.push(item);
    }
  });

  if (previousList.length === 0) {
    return {
      initialImport: true,
      addedCount: nextList.length,
      removedCount: 0,
      updatedCount: 0,
      statusChanges: 0,
      progressChanges: 0,
      removedItems: [],
      updatedItems: [],
    };
  }

  return {
    initialImport: false,
    addedCount: added.length,
    removedCount: removed.length,
    updatedCount: updated.length,
    statusChanges,
    progressChanges,
    removedItems: removed.map((item) => ({
      id: getTrackingKey(item),
      name: item.name,
      initiativeName: item.initiativeName,
    })),
    updatedItems: updated.slice(0, 4),
  };
}

function formatChangedFieldLabel(field) {
  const labels = {
    name: "name",
    initiative: "initiative",
    status: "status",
    progress: "progress",
    startDate: "start date",
    endDate: "end date",
    blockers: "blockers",
    notes: "notes",
  };

  return labels[field] || field;
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
      const externalId = String(
        getRowValue(row, ["itemid", "workitemid", "trackingid", "id"]),
      ).trim();
      const startDate = normalizeExcelDate(getRowValue(row, ["startdate"]));
      const endDate = normalizeExcelDate(getRowValue(row, ["enddate"]));
      const durationValue = String(
        getRowValue(row, ["duration", "durationmonths", "months"]),
      ).trim();
      const item = {
        id: itemId,
        externalId,
        initiativeId: sheetEntry.initiative.id,
        initiativeName: sheetEntry.initiative.name,
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
        dependencyLinks: [],
        blockers: String(getRowValue(row, ["blockers"])).trim(),
        progress: Math.max(
          0,
          Math.min(
            100,
            Number.parseInt(getRowValue(row, ["progress", "progresspercent"]), 10) || 0,
          ),
        ),
        notes: String(getRowValue(row, ["notes"])).trim(),
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
    item.dependencyLinks = entry.references.map((reference) => {
      const [initiativeName, itemName] = reference.includes("::")
        ? reference.split("::")
        : [entry.initiativeName, reference];
      const key = `${String(initiativeName).trim().toLowerCase()}::${String(itemName)
        .trim()
        .toLowerCase()}`;

      return {
        reference,
        itemId: itemLookup.get(key) || "",
      };
    });
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
      "Item ID",
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
      "Blockers",
      "Progress %",
      "Notes",
    ],
    [
      "Q-001",
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
      "",
      "25",
      "Initial framework definition in progress.",
    ],
    [
      "Q-002",
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
      "",
      "0",
      "",
    ],
    [
      "Q-003",
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
      "Awaiting environment access approval",
      "0",
      "Track access approval in weekly review.",
    ],
  ]);

  initiativeSheet["!cols"] = [
    { wch: 16 },
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
    { wch: 32 },
    { wch: 14 },
    { wch: 42 },
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
    externalId: item.externalId || "",
    initiativeName: item.initiativeName || "",
    progress: typeof item.progress === "number" ? item.progress : 0,
    blockers: item.blockers || "",
    notes: item.notes || "",
    dependencyRefs: Array.isArray(item.dependencyRefs) ? item.dependencyRefs : [],
    dependencyLinks: Array.isArray(item.dependencyLinks) ? item.dependencyLinks : [],
  }));
}

function normalizePersistedState(parsed) {
  return {
    portfolioName: parsed?.portfolioName || defaultState.portfolioName,
    teamName: parsed?.teamName || "",
    audience: parsed?.audience || defaultState.audience,
    vision: parsed?.vision || defaultState.vision,
    initiatives: Array.isArray(parsed?.initiatives) ? parsed.initiatives : [],
    workItems: Array.isArray(parsed?.workItems) ? normalizeWorkItems(parsed.workItems) : [],
    milestones: Array.isArray(parsed?.milestones) ? parsed.milestones : [],
    importDiff: parsed?.importDiff || null,
  };
}

function getShareableState(state) {
  return {
    portfolioName: state.portfolioName,
    teamName: state.teamName,
    audience: state.audience,
    vision: state.vision,
    initiatives: state.initiatives,
    workItems: state.workItems,
    milestones: state.milestones,
    importDiff: state.importDiff,
  };
}

function loadLocalSnapshot() {
  if (typeof window === "undefined") {
    return null;
  }

  const stored = window.localStorage.getItem(STORAGE_KEY);

  if (!stored) {
    return null;
  }

  try {
    return normalizePersistedState(JSON.parse(stored));
  } catch {
    return null;
  }
}

function formatRelativeSnapshotTime(updatedAtMs) {
  if (!updatedAtMs) {
    return "Not saved yet";
  }

  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(updatedAtMs));
  } catch {
    return "Recently updated";
  }
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

function formatDependencyReference(item) {
  if (item.dependencyDisplayLabels?.length > 0) {
    return item.dependencyDisplayLabels.join("; ");
  }

  return item.dependencyNames.join("; ");
}

function App() {
  const [state, setState] = useState(defaultState);
  const [importMessage, setImportMessage] = useState("");
  const [expandedItemId, setExpandedItemId] = useState("");
  const [selectedFileName, setSelectedFileName] = useState("");
  const [pendingWorkbook, setPendingWorkbook] = useState(null);
  const [visibleStartIndex, setVisibleStartIndex] = useState(0);
  const [visibleEndIndex, setVisibleEndIndex] = useState(0);
  const [collapsedInitiatives, setCollapsedInitiatives] = useState({});
  const [showDependencies, setShowDependencies] = useState(false);
  const [dependencyPanelOpen, setDependencyPanelOpen] = useState(false);
  const [showRemovedItems, setShowRemovedItems] = useState(false);
  const [entryMode, setEntryMode] = useState("");
  const [sharedUser, setSharedUser] = useState(null);
  const [authReady, setAuthReady] = useState(() => !isSharedStorageConfigured());
  const [sharedSnapshotLoaded, setSharedSnapshotLoaded] = useState(false);
  const [selectedRoadmapKey, setSelectedRoadmapKey] = useState("");
  const [sharedRoadmapMeta, setSharedRoadmapMeta] = useState(() =>
    Object.fromEntries(
      SHARED_ROADMAP_SLOTS.map((slot) => [
        slot.key,
        {
          exists: false,
          roadmapKey: slot.key,
          roadmapLabel: slot.label,
          teamName: slot.teamName,
          updatedBy: "",
          updatedAtMs: 0,
        },
      ]),
    ),
  );
  const [pendingSharedUploads, setPendingSharedUploads] = useState({});
  const [customSharedTeamName, setCustomSharedTeamName] = useState("");
  const [lastSavedRoadmapKey, setLastSavedRoadmapKey] = useState("");

  async function refreshSharedRoadmapMeta(userId) {
    if (!userId) {
      return;
    }

    const entries = await Promise.all(
      SHARED_ROADMAP_SLOTS.map(async (slot) => {
        const meta = await loadSharedRoadmapMeta(userId, slot.key);

        return [
          slot.key,
          {
            exists: meta?.exists || false,
            roadmapKey: slot.key,
            roadmapLabel: meta?.roadmapLabel || slot.label,
            teamName: meta?.teamName || slot.teamName,
            updatedBy: meta?.updatedBy || "",
            updatedAtMs: meta?.updatedAtMs || 0,
          },
        ];
      }),
    );

    setSharedRoadmapMeta(Object.fromEntries(entries));
  }

  async function loadSharedRoadmapSlot(roadmapKey) {
    if (!sharedUser) {
      return;
    }

    setSharedSnapshotLoaded(false);

    try {
      const sharedState = await loadSharedRoadmapState(sharedUser.uid, roadmapKey);
      const slot = SHARED_ROADMAP_SLOTS.find((entry) => entry.key === roadmapKey);
      const meta = sharedRoadmapMeta[roadmapKey];

      if (sharedState) {
        setState((current) => ({
          ...current,
          ...normalizePersistedState(sharedState),
          activePage: "roadmap",
        }));
        setImportMessage("Shared roadmap snapshot loaded.");
      } else {
        setState((current) => ({
          ...current,
          activePage: "input",
          teamName: meta?.teamName || slot?.teamName || current.teamName,
        }));
        setImportMessage("No saved snapshot yet. Upload a workbook to create it.");
      }

      if (slot && !slot.fixed) {
        setCustomSharedTeamName(meta?.teamName || "");
      }
      setSelectedRoadmapKey(roadmapKey);
    } catch {
      setImportMessage("Unable to load that shared roadmap right now.");
    } finally {
      setSharedSnapshotLoaded(true);
    }
  }

  useEffect(() => {
    if (entryMode === "local") {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(getShareableState(state)));
    }
  }, [entryMode, state]);

  useEffect(() => {
    if (!lastSavedRoadmapKey) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setLastSavedRoadmapKey("");
    }, 3500);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [lastSavedRoadmapKey]);

  useEffect(() => {
    if (!isSharedStorageConfigured()) {
      return undefined;
    }

    return subscribeToSharedAuth((user) => {
      setSharedUser(user);
      setAuthReady(true);
    });
  }, []);

  useEffect(() => {
    if (entryMode === "shared" && authReady && !sharedUser) {
      setEntryMode("");
      setSharedSnapshotLoaded(false);
      setSelectedRoadmapKey("");
      setState((current) => ({
        ...current,
        activePage: "mode",
      }));
      setImportMessage(
        "Google sign-in is required to use shared storage. Sign in again or use local mode.",
      );
    }
  }, [authReady, entryMode, sharedUser]);

  useEffect(() => {
    if (entryMode !== "shared" || !sharedUser) {
      return undefined;
    }

    let cancelled = false;

    async function hydrateSharedWorkspace() {
      try {
        await refreshSharedRoadmapMeta(sharedUser.uid);

        if (cancelled) {
          return;
        }

        setSharedSnapshotLoaded(true);

        if (!selectedRoadmapKey) {
          setImportMessage(
            "Choose a roadmap slot below, then upload a workbook or open an existing saved roadmap.",
          );
        }
      } catch {
        if (!cancelled) {
          setImportMessage(
            "Shared storage is unavailable right now. Try again or use local mode.",
          );
          setSharedSnapshotLoaded(true);
        }
      }
    }

    hydrateSharedWorkspace();

    return () => {
      cancelled = true;
    };
  }, [entryMode, sharedUser, selectedRoadmapKey]);

  useEffect(() => {
    if (
      entryMode !== "shared" ||
      !sharedUser ||
      !sharedSnapshotLoaded ||
      !selectedRoadmapKey
    ) {
      return undefined;
    }

    let cancelled = false;

    async function persistSharedState() {
      try {
        const meta = sharedRoadmapMeta[selectedRoadmapKey];
        await saveSharedRoadmapState(sharedUser.uid, selectedRoadmapKey, getShareableState(state), {
          roadmapLabel:
            meta?.roadmapLabel ||
            SHARED_ROADMAP_SLOTS.find((slot) => slot.key === selectedRoadmapKey)?.label ||
            "Team Roadmap",
          teamName: state.teamName || meta?.teamName || "",
          updatedBy: sharedUser.email || "",
        });
        await refreshSharedRoadmapMeta(sharedUser.uid);
      } catch {
        if (!cancelled) {
          setImportMessage(
            "Shared storage save failed. Sign in with Google to keep shared data, or switch to local mode.",
          );
        }
      }
    }

    persistSharedState();

    return () => {
      cancelled = true;
    };
  }, [entryMode, sharedUser, sharedSnapshotLoaded, selectedRoadmapKey, state]);

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
    const initiativeItemCount = new Map();
    const numberMap = new Map();
    scheduledItems.forEach((item) => {
      const nextNumber = (initiativeItemCount.get(item.initiativeId) || 0) + 1;
      initiativeItemCount.set(item.initiativeId, nextNumber);
      numberMap.set(item.id, nextNumber);
    });
    const scheduledItemMap = new Map(
      scheduledItems.map((item) => [item.id, item]),
    );
    const numberedScheduledItems = scheduledItems.map((item) => ({
      ...item,
      itemNumber: numberMap.get(item.id) || 0,
      dependencyItemNumbers: item.dependencyIds
        .map((dependencyId) => numberMap.get(dependencyId))
        .filter(Boolean),
      dependencyDisplayLabels:
        item.dependencyLinks?.length > 0
          ? item.dependencyLinks.map((dependencyLink) => {
              if (dependencyLink.itemId) {
                const dependencyItem = scheduledItemMap.get(dependencyLink.itemId);

                if (dependencyItem) {
                  return `${numberMap.get(dependencyLink.itemId) || "?"}. ${dependencyItem.name}`;
                }
              }

              return dependencyLink.reference;
            })
          : item.dependencyNames,
      completionPercent: typeof item.progress === "number" ? item.progress : 0,
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
  const expandedItem = roadmapModel.scheduledItems.find(
    (item) => item.id === expandedItemId,
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
    } finally {
      event.target.value = "";
    }
  }

  async function handleSharedFileSelection(roadmapKey, event) {
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

      setPendingSharedUploads((current) => ({
        ...current,
        [roadmapKey]: {
          workbook,
          fileName: file.name,
        },
      }));
      setImportMessage("File ready. Click Generate Roadmap to update that team.");
    } catch {
      setPendingSharedUploads((current) => {
        const next = { ...current };
        delete next[roadmapKey];
        return next;
      });
      setImportMessage(
        "Import failed. Check that the workbook is a valid .xlsx file with row headers.",
      );
    } finally {
      event.target.value = "";
    }
  }

  function clearLocalPendingUpload() {
    setPendingWorkbook(null);
    setSelectedFileName("");
  }

  function clearSharedPendingUpload(roadmapKey) {
    setPendingSharedUploads((current) => {
      const next = { ...current };
      delete next[roadmapKey];
      return next;
    });
  }

  function generateRoadmap() {
    if (!pendingWorkbook) {
      setImportMessage("Select an Excel file before generating the roadmap.");
      return;
    }

    setState((current) => ({
      ...(() => {
        const nextState = buildStateFromWorkbook(pendingWorkbook, current);

        return {
          ...nextState,
          importDiff: compareImportStates(current.workItems, nextState.workItems),
        };
      })(),
      activePage: "roadmap",
    }));
    setShowRemovedItems(false);
    setImportMessage(`Roadmap generated from ${selectedFileName}.`);
  }

  async function generateSharedRoadmap(roadmapKey) {
    const pendingUpload = pendingSharedUploads[roadmapKey];

    if (!pendingUpload?.workbook) {
      setImportMessage("Select an Excel file before generating the roadmap.");
      return;
    }

    const slot = SHARED_ROADMAP_SLOTS.find((entry) => entry.key === roadmapKey);
    const fixedTeamName = slot?.fixed ? slot.teamName : "";
    const targetTeamName =
      fixedTeamName ||
      customSharedTeamName.trim() ||
      sharedRoadmapMeta[roadmapKey]?.teamName ||
      "New Team";
    let previousSharedState = null;

    if (sharedUser) {
      try {
        previousSharedState = await loadSharedRoadmapState(sharedUser.uid, roadmapKey);
      } catch {
        previousSharedState = null;
      }
    }
    const previousWorkItems = normalizePersistedState(previousSharedState || {}).workItems;
    const nextComputedState = (() => {
      const seedState = {
        ...state,
        teamName: targetTeamName,
      };
      const nextState = buildStateFromWorkbook(pendingUpload.workbook, seedState);

      return {
        ...nextState,
        teamName: targetTeamName,
        importDiff: compareImportStates(previousWorkItems, nextState.workItems),
      };
    })();

    if (sharedUser) {
      try {
        await saveSharedRoadmapState(
          sharedUser.uid,
          roadmapKey,
          getShareableState(nextComputedState),
          {
            roadmapLabel: slot?.label || "Team Roadmap",
            teamName: targetTeamName,
            updatedBy: sharedUser.email || "",
          },
        );
        await refreshSharedRoadmapMeta(sharedUser.uid);
      } catch {
        setImportMessage(
          "Shared storage save failed. Check Firebase sign-in and Firestore rules, or switch to local mode.",
        );
        return;
      }
    }

    setSelectedRoadmapKey(roadmapKey);
    setLastSavedRoadmapKey(roadmapKey);
    setSharedSnapshotLoaded(true);
    setShowRemovedItems(false);
    setState(() => ({
      ...nextComputedState,
      activePage: "roadmap",
    }));
    clearSharedPendingUpload(roadmapKey);
    setImportMessage(`${targetTeamName} roadmap generated from ${pendingUpload.fileName}.`);
  }

  async function enterSharedMode() {
    if (!isSharedStorageConfigured()) {
      setImportMessage(
        "Shared mode is not configured yet. Add Firebase web app keys, then try again.",
      );
      return;
    }

    try {
      if (!sharedUser) {
        await signInToSharedMode();
      }

      setSelectedRoadmapKey("");
      setSharedSnapshotLoaded(false);
      setEntryMode("shared");
      setState((current) => ({ ...current, activePage: "input" }));
      setImportMessage("Shared mode enabled.");
    } catch {
      setImportMessage(
        "Google sign-in is required to save shared data. Try again or choose local mode.",
      );
    }
  }

  function enterLocalMode() {
    const localSnapshot = loadLocalSnapshot();

    setEntryMode("local");
    setSelectedRoadmapKey("");
    setSharedSnapshotLoaded(false);
    setState((current) => ({
      ...current,
      ...(localSnapshot || normalizePersistedState(defaultState)),
      activePage: "input",
    }));
    setImportMessage(
      localSnapshot
        ? "Local browser snapshot loaded."
        : "Local mode enabled. Import a workbook to create the first browser snapshot.",
    );
  }

  async function returnToHome() {
    if (entryMode === "shared" && sharedUser) {
      try {
        await signOutFromSharedMode();
      } catch {
        // Keep the UI resilient; the mode reset still returns the user home.
      }
    }

    setEntryMode("");
    setSharedSnapshotLoaded(false);
    setExpandedItemId("");
    setPendingWorkbook(null);
    setSelectedFileName("");
    setShowRemovedItems(false);
    setState((current) => ({
      ...current,
      activePage: "landing",
    }));
    setImportMessage("");
  }

  function updateWorkItem(itemId, field, value) {
    setState((current) => ({
      ...current,
      workItems: current.workItems.map((item) =>
        item.id === itemId ? { ...item, [field]: value } : item,
      ),
    }));
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

  if (state.activePage === "landing") {
    return (
      <div className="app-shell">
        <main className="landing-shell">
          <section className="hero-copy landing-panel">
            <p className="eyebrow">Roadmap Generator</p>
            <h1>Roadmap Generator</h1>
            <p className="lede">
              Build a leadership-ready delivery roadmap from a single Excel workbook,
              preserve snapshot history, and review changes over time.
            </p>
            <button
              type="button"
              className="primary-button landing-action"
              onClick={() =>
                setState((current) => ({ ...current, activePage: "mode" }))
              }
            >
              Enter Roadmap Generator
            </button>
          </section>
        </main>
      </div>
    );
  }

  if (state.activePage === "mode") {
    return (
      <div className="app-shell">
        <main className="landing-shell">
          <section className="panel mode-panel">
            <div>
              <p className="eyebrow">Entry Mode</p>
              <h2>Choose how you want to work</h2>
              <p className="subtle-copy">
                Use Google sign-in for shared snapshots across browsers and
                machines, or choose local mode to keep everything in the current browser.
              </p>
            </div>

            <div className="mode-card-grid">
              <article className="mode-card">
                <p className="signal-label">Shared Mode</p>
                <strong>Google Sign-In</strong>
                <p className="subtle-copy">
                  Saves the roadmap snapshot to Firestore so the same data is
                  available across devices.
                </p>
                <button
                  type="button"
                  className="primary-button"
                  onClick={enterSharedMode}
                  disabled={!authReady}
                >
                  {sharedUser ? "Continue In Shared Mode" : "Sign In With Google"}
                </button>
              </article>

              <article className="mode-card">
                <p className="signal-label">Browser Mode</p>
                <strong>Local Mode Storage</strong>
                <p className="subtle-copy">
                  Keeps imports and snapshot history in this browser only. No sign-in required.
                </p>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={enterLocalMode}
                >
                  Continue In Local Mode
                </button>
              </article>
            </div>

            {importMessage ? <p className="subtle-copy">{importMessage}</p> : null}
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <div className="workspace-topbar">
        <div className="workspace-nav">
          <div className="workspace-intro">
            <p className="eyebrow">Delivery Roadmap Creator</p>
            <p className="workspace-intro-copy">
              Upload an Excel workbook and generate a compact delivery roadmap
              that is ready to review or paste into leadership slides.
            </p>
          </div>
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
          {entryMode === "shared" ? (
            <div className="roadmap-shortcuts">
              {SHARED_ROADMAP_SLOTS.filter(
                (slot) => slot.fixed || sharedRoadmapMeta[slot.key]?.exists,
              ).map((slot) => {
                const meta = sharedRoadmapMeta[slot.key];
                const label = meta?.teamName
                  ? `${meta.teamName} Roadmap`
                  : slot.label;

                return (
                  <button
                    key={slot.key}
                    type="button"
                    className={
                      selectedRoadmapKey === slot.key
                        ? "shortcut-pill active"
                        : "shortcut-pill"
                    }
                    onClick={() => loadSharedRoadmapSlot(slot.key)}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
        <button type="button" className="ghost-button" onClick={returnToHome}>
          Entry Mode
        </button>
      </div>

      {state.activePage === "input" && entryMode === "local" ? (
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
              `Initiative` are imported. Expected columns: `Item ID`,
              `Initiative`, `Initiative Narrative Theme`, `Item Name`, `Description`,
              `Start Date`, `End Date`, `Owner`, `Status`, `Milestone`,
              `Milestone Quarter`, `Dependencies`, `Blockers`, `Progress %`,
              `Notes`.
            </p>

            <p className="subtle-copy">
              Local mode keeps the roadmap snapshot and import history in this browser only.
            </p>

            <label>
              Team
              <input
                type="text"
                value={state.teamName}
                onChange={(event) =>
                  setState((current) => ({ ...current, teamName: event.target.value }))
                }
                placeholder="Enter team name"
              />
            </label>

            <label className="upload-dropzone">
              <span className="upload-label">Select Excel File</span>
              <input type="file" accept=".xlsx,.xls" onChange={handleFileSelection} />
            </label>

            <div className="file-status-row">
              <span className="file-pill">
                {selectedFileName || "No file selected"}
                {selectedFileName ? (
                  <button
                    type="button"
                    className="file-clear-button"
                    onClick={clearLocalPendingUpload}
                    aria-label="Remove selected file"
                  >
                    ×
                  </button>
                ) : null}
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
      ) : state.activePage === "input" ? (
        <main className="input-layout upload-only-layout">
          <section className="panel input-panel upload-panel shared-upload-panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Shared Team Workbooks</p>
                <h2>Upload your roadmap workbook for existing teams</h2>
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
              Shared mode stores each roadmap in Firestore under your Google
              account, so the same team roadmap is available across browsers and machines.
            </p>

            <div className="shared-slot-grid">
              {SHARED_ROADMAP_SLOTS.filter((slot) => slot.fixed).map((slot) => {
                const pendingUpload = pendingSharedUploads[slot.key];
                const meta = sharedRoadmapMeta[slot.key];

                return (
                  <article className="shared-slot-card" key={slot.key}>
                    <div className="shared-slot-top">
                      <div>
                        <p className="signal-label">Existing Team</p>
                        <h3>{slot.teamName}</h3>
                      </div>
                      <div className="shared-status-stack">
                        <span className={meta?.exists ? "shared-status ready" : "shared-status"}>
                          {meta?.exists ? "Saved" : "Not saved"}
                        </span>
                        {lastSavedRoadmapKey === slot.key ? (
                          <span className="shared-status success">Saved successfully</span>
                        ) : null}
                      </div>
                    </div>
                    <p className="shared-meta-copy">
                      Last updated: {formatRelativeSnapshotTime(meta?.updatedAtMs)}
                      {meta?.updatedBy ? ` by ${meta.updatedBy}` : ""}
                    </p>
                    <label className="upload-dropzone shared-dropzone">
                      <span className="upload-label">Select Excel File</span>
                      <input
                        type="file"
                        accept=".xlsx,.xls"
                        onChange={(event) => handleSharedFileSelection(slot.key, event)}
                      />
                    </label>
                    <div className="file-status-row">
                      <span className="file-pill">
                        {pendingUpload?.fileName || "No file selected"}
                        {pendingUpload?.fileName ? (
                          <button
                            type="button"
                            className="file-clear-button"
                            onClick={() => clearSharedPendingUpload(slot.key)}
                            aria-label={`Remove selected file for ${slot.teamName}`}
                          >
                            ×
                          </button>
                        ) : null}
                      </span>
                    </div>
                    <div className="shared-slot-actions">
                      <button
                        type="button"
                        className="primary-button"
                        onClick={() => generateSharedRoadmap(slot.key)}
                      >
                        Generate Roadmap
                      </button>
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => loadSharedRoadmapSlot(slot.key)}
                      >
                        Open Roadmap
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>

            <div className="shared-custom-section">
              <div>
                <p className="eyebrow">New Team</p>
                <h2>Create a new team preview</h2>
              </div>
              <article className="shared-slot-card">
                <div className="shared-slot-top">
                  <div>
                    <p className="signal-label">Custom Team</p>
                    <h3>{sharedRoadmapMeta["custom-team"]?.teamName || "New Team Preview"}</h3>
                  </div>
                  <div className="shared-status-stack">
                    <span
                      className={
                        sharedRoadmapMeta["custom-team"]?.exists
                          ? "shared-status ready"
                          : "shared-status"
                      }
                    >
                      {sharedRoadmapMeta["custom-team"]?.exists ? "Saved" : "Not saved"}
                    </span>
                    {lastSavedRoadmapKey === "custom-team" ? (
                      <span className="shared-status success">Saved successfully</span>
                    ) : null}
                  </div>
                </div>
                <p className="shared-meta-copy">
                  Last updated: {formatRelativeSnapshotTime(sharedRoadmapMeta["custom-team"]?.updatedAtMs)}
                  {sharedRoadmapMeta["custom-team"]?.updatedBy
                    ? ` by ${sharedRoadmapMeta["custom-team"]?.updatedBy}`
                    : ""}
                </p>
                <label>
                  Team
                  <input
                    type="text"
                    value={customSharedTeamName}
                    onChange={(event) => setCustomSharedTeamName(event.target.value)}
                    placeholder="Enter new team name"
                  />
                </label>
                <label className="upload-dropzone shared-dropzone">
                  <span className="upload-label">Select Excel File</span>
                  <input
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={(event) => handleSharedFileSelection("custom-team", event)}
                  />
                </label>
                <div className="file-status-row">
                  <span className="file-pill">
                    {pendingSharedUploads["custom-team"]?.fileName || "No file selected"}
                    {pendingSharedUploads["custom-team"]?.fileName ? (
                      <button
                        type="button"
                        className="file-clear-button"
                        onClick={() => clearSharedPendingUpload("custom-team")}
                        aria-label="Remove selected file for new team"
                      >
                        ×
                      </button>
                    ) : null}
                  </span>
                </div>
                <div className="shared-slot-actions">
                  <button
                    type="button"
                    className="primary-button"
                    onClick={() => generateSharedRoadmap("custom-team")}
                  >
                    Generate Roadmap
                  </button>
                  {sharedRoadmapMeta["custom-team"]?.exists ? (
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => loadSharedRoadmapSlot("custom-team")}
                    >
                      Open Roadmap
                    </button>
                  ) : null}
                </div>
              </article>
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
                <h2>{state.teamName ? `${state.teamName} Delivery Roadmap` : "Delivery Roadmap"}</h2>
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

            {state.importDiff ? (
              <div className="import-diff-panel">
                <div className="import-diff-header">
                  <div>
                    <p className="signal-label">Import Changes</p>
                    <strong>
                      {state.importDiff.initialImport
                        ? `Initial import loaded ${state.importDiff.addedCount} items`
                        : `${state.importDiff.addedCount} added • ${state.importDiff.removedCount} removed • ${state.importDiff.updatedCount} updated`}
                    </strong>
                  </div>
                  {state.importDiff.removedCount > 0 ? (
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() => setShowRemovedItems((current) => !current)}
                    >
                      {showRemovedItems ? "Hide Removed" : "Show Removed"}
                    </button>
                  ) : null}
                </div>
                {!state.importDiff.initialImport ? (
                  <p className="subtle-copy import-diff-meta">
                    Status changes: {state.importDiff.statusChanges} • Progress updates:{" "}
                    {state.importDiff.progressChanges}
                  </p>
                ) : null}
                {state.importDiff.updatedItems?.length > 0 ? (
                  <div className="import-change-list">
                    {state.importDiff.updatedItems.map((item) => (
                      <div className="import-change-pill" key={`${item.initiativeName}-${item.name}`}>
                        <strong>{item.name}</strong>
                        <span>{item.changedFields.map(formatChangedFieldLabel).join(", ")}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
                {showRemovedItems && state.importDiff.removedItems?.length > 0 ? (
                  <div className="removed-items-list">
                    {state.importDiff.removedItems.map((item) => (
                      <div className="removed-item" key={item.id}>
                        <strong>{item.name}</strong>
                        <span>{item.initiativeName}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

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
                    {visibleTimeline.map((month, monthOffset) => {
                      const absoluteMonthIndex = visibleStartIndex + monthOffset;
                      const isHighlighted =
                        expandedItem &&
                        absoluteMonthIndex >= expandedItem.startIndex &&
                        absoluteMonthIndex <= expandedItem.displayEndIndex;

                      return (
                      <div
                        key={month.label}
                        className={isHighlighted ? "month-cell highlighted" : "month-cell"}
                      >
                        <span>{month.shortLabel}</span>
                        <small>{month.quarter}</small>
                      </div>
                      );
                    })}
                  </div>
                </div>

                {roadmapModel.preparedInitiatives.map((initiative) => {
                  const items = roadmapModel.scheduledItems.filter(
                    (item) => item.initiative?.id === initiative.id,
                  );
                  const completedCount = items.filter(
                    (item) => item.status === "Done",
                  ).length;
                  const blockedCount = items.filter(
                    (item) => item.status === "Blocked",
                  ).length;
                  const activeCount = items.filter(
                    (item) => item.status !== "Done" && item.status !== "Blocked",
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
                        <div className="sticky-column initiative-toggle-main">
                          <div className="initiative-label">
                            <p>{initiative.name || "Untitled initiative"}</p>
                            <span className={`initiative-progress ${getProgressBadgeColor(calculateInitiativeProgress(items))}`}>
                              {calculateInitiativeProgress(items)}% avg progress
                            </span>
                          </div>
                          {!isCollapsed && initiative.narrative ? (
                            <span className="initiative-inline-narrative">
                              {initiative.narrative}
                            </span>
                          ) : null}
                          <span className="initiative-count">
                            {items.length} item{items.length === 1 ? "" : "s"} • {activeCount} active • {blockedCount} blocked • {completedCount} done
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
                                        item.status === "Blocked" ? "blocked" : ""
                                      } ${
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
                                    {showDependencies && formatDependencyReference(item) ? (
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
                                          {`Depends on ${formatDependencyReference(item) || "dependency"}`}
                                        </span>
                                      </div>
                                    ) : null}
                                  </div>
                                </div>
                              </button>

                              {isExpanded ? (
                                <div className="item-detail-panel">
                                  <div className="detail-grid">
                                    <div className="detail-row">
                                      <span className="detail-label">Owner:</span>
                                      <span className="detail-value">{item.owner || "Owner pending"}</span>
                                    </div>
                                    <div className="detail-row">
                                      <span className="detail-label">Status:</span>
                                      <span className="detail-value">{item.status}</span>
                                    </div>
                                    <div className="detail-row">
                                      <span className="detail-label">Timeline:</span>
                                      <span className="detail-value">
                                        {roadmapModel.timeline[item.startIndex]?.label || "Start pending"} to{" "}
                                        {roadmapModel.timeline[item.displayEndIndex]?.label || "End pending"}
                                      </span>
                                    </div>
                                    <div className="detail-row">
                                      <span className="detail-label">Blockers:</span>
                                      <span className="detail-value">
                                        {item.blockers ? item.blockers : "No blockers"}
                                      </span>
                                    </div>
                                    <div className="detail-row dependency-detail-row">
                                      <span className="detail-label">Dependencies:</span>
                                      <span className="detail-value">
                                        {formatDependencyReference(item)
                                          ? `Depends on ${formatDependencyReference(item)}`
                                          : "No dependencies"}
                                      </span>
                                    </div>
                                    <div className="detail-row progress-row">
                                      <span className="detail-label">Progress:</span>
                                      <div className="detail-progress-block">
                                        <span className="detail-value">{item.progress || 0}%</span>
                                        <div className="progress-bar detail-progress-bar">
                                          <div
                                            className="progress-bar-fill"
                                            style={{ width: `${item.progress || 0}%` }}
                                          />
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                  {roadmapModel.preparedMilestones
                                    .filter((milestone) => milestone.itemId === item.id)
                                    .map((milestone) => (
                                      <div className="milestone-callout" key={milestone.id}>
                                        <span
                                          className="milestone-callout-icon"
                                          aria-hidden="true"
                                        />
                                        <div className="milestone-callout-copy">
                                          <span className="milestone-callout-label">
                                            Milestone
                                          </span>
                                          <strong>
                                            {milestone.label} ({milestone.quarter})
                                          </strong>
                                        </div>
                                      </div>
                                    ))}
                                  {item.notes ? (
                                    <div className="detail-row notes-row">
                                      <span className="detail-label">Notes:</span>
                                      <span className="detail-value">{item.notes}</span>
                                    </div>
                                  ) : null}
                                  {item.description ? (
                                    <div className="detail-row notes-row description-row">
                                      <span className="detail-label">Description:</span>
                                      <span className="detail-value">{item.description}</span>
                                    </div>
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
