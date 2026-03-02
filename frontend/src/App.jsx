import { useEffect, useMemo, useState } from "react";
import "./App.css";

const STORAGE_KEY = "roadmap-companion-v2";
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
    "Create a lightweight roadmap companion that converts planning inputs into executive-ready delivery narratives.",
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
      duration: "2",
      status: "Planned",
      dependencyIds: ["item-1"],
    },
    {
      id: "item-3",
      initiativeId: "initiative-1",
      name: "Leadership summary generator",
      owner: "PMO",
      startDate: "2026-03-01",
      duration: "1",
      status: "Planned",
      dependencyIds: ["item-2"],
    },
    {
      id: "item-4",
      initiativeId: "initiative-2",
      name: "Test coverage expansion",
      owner: "QA Lead",
      startDate: "2026-03-12",
      duration: "2",
      status: "Planned",
      dependencyIds: ["item-1"],
    },
    {
      id: "item-5",
      initiativeId: "initiative-2",
      name: "Release governance dashboard",
      owner: "Engineering Manager",
      startDate: "2026-05-01",
      duration: "2",
      status: "Planned",
      dependencyIds: ["item-3", "item-4"],
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

function parseDateInput(value) {
  if (!value) {
    return null;
  }

  const [yearText, monthText, dayText] = value.split("-");
  const year = Number.parseInt(yearText, 10);
  const month = Number.parseInt(monthText, 10);
  const day = Number.parseInt(dayText, 10);

  if ([year, month, day].some(Number.isNaN)) {
    return null;
  }

  return new Date(Date.UTC(year, month - 1, day));
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

function normalizeItems(workItems) {
  return workItems.map((item) => ({
    ...item,
    dependencyIds: Array.isArray(item.dependencyIds) ? item.dependencyIds : [],
  }));
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

    if (startDate) {
      timelineDates.push(startOfMonth(startDate));
      const duration = Math.max(1, Number.parseInt(item.duration, 10) || 1);
      timelineDates.push(addMonths(startOfMonth(startDate), duration - 1));
    }
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
  const span = monthDiff(safeStart, safeEnd) + 1;

  if (span < 6) {
    safeEnd = addMonths(safeStart, 5);
  }

  const totalMonths = monthDiff(safeStart, safeEnd) + 1;

  return Array.from({ length: totalMonths }, (_, index) => {
    const date = addMonths(safeStart, index);

    return {
      index,
      date,
      label: formatMonth(date),
      quarter: getQuarterLabel(date),
      shortLabel: MONTH_NAMES[date.getUTCMonth()],
    };
  });
}

function toTimelineIndex(dateString, timelineStart) {
  const date = parseDateInput(dateString);

  if (!date || !timelineStart) {
    return 0;
  }

  return Math.max(0, monthDiff(timelineStart, startOfMonth(date)));
}

function prepareInitiatives(initiatives, timeline) {
  const timelineStart = timeline[0]?.date;
  const timelineEndIndex = Math.max(0, timeline.length - 1);

  return initiatives.map((initiative) => {
    const startDate = parseDateInput(initiative.startDate);
    const endDate = parseDateInput(initiative.endDate) || startDate;
    const startIndex = Math.min(toTimelineIndex(initiative.startDate, timelineStart), timelineEndIndex);
    const endIndex = Math.min(
      Math.max(startIndex, toTimelineIndex(initiative.endDate || initiative.startDate, timelineStart)),
      timelineEndIndex,
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
  const timelineEndIndex = Math.max(0, timeline.length - 1);
  const initiativeMap = new Map(preparedInitiatives.map((initiative) => [initiative.id, initiative]));
  const items = normalizeItems(workItems);
  const indegree = new Map(items.map((item) => [item.id, 0]));
  const adjacency = new Map(items.map((item) => [item.id, []]));
  const itemMap = new Map(items.map((item) => [item.id, item]));

  items.forEach((item) => {
    item.dependencyIds.forEach((dependencyId) => {
      if (!itemMap.has(dependencyId)) {
        return;
      }

      indegree.set(item.id, (indegree.get(item.id) || 0) + 1);
      adjacency.get(dependencyId)?.push(item.id);
    });
  });

  const queue = items.filter((item) => indegree.get(item.id) === 0);
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

  const hasCycle = ordered.length !== items.length;
  const unscheduledIds = new Set(
    hasCycle
      ? items
          .filter((item) => !ordered.some((entry) => entry.id === item.id))
          .map((item) => item.id)
      : [],
  );
  const executionOrder = hasCycle
    ? [...ordered, ...items.filter((item) => unscheduledIds.has(item.id))]
    : ordered;
  const scheduledMap = new Map();

  const scheduledItems = executionOrder.map((item) => {
    const initiative = initiativeMap.get(item.initiativeId) || preparedInitiatives[0] || null;
    const duration = Math.max(1, Number.parseInt(item.duration, 10) || 1);
    const requestedStartIndex = Math.min(
      toTimelineIndex(item.startDate, timelineStart),
      timelineEndIndex,
    );
    const dependencyEnds = item.dependencyIds
      .map((dependencyId) => scheduledMap.get(dependencyId))
      .filter(Boolean)
      .map((dependency) => dependency.endIndex);
    const earliestStartIndex = dependencyEnds.length
      ? Math.max(...dependencyEnds) + 1
      : initiative?.startIndex || 0;
    const startIndex = Math.max(
      requestedStartIndex,
      earliestStartIndex,
      initiative?.startIndex || 0,
    );
    const endIndex = startIndex + duration - 1;
    const beyondInitiative = Boolean(initiative) && endOfMonth(addMonths(timelineStart, endIndex)).getTime() >
      (initiative.endDateObj ? endOfMonth(initiative.endDateObj).getTime() : Number.MAX_SAFE_INTEGER);
    const beyondHorizon = endIndex > timelineEndIndex;
    const circularDependency = unscheduledIds.has(item.id);
    const atRisk = beyondInitiative || beyondHorizon || circularDependency;
    const scheduledItem = {
      ...item,
      duration,
      initiative,
      startIndex,
      endIndex,
      displayEndIndex: Math.min(endIndex, timelineEndIndex),
      requestedQuarter: getQuarterLabel(parseDateInput(item.startDate) || timelineStart),
      dependencyNames: item.dependencyIds
        .map((dependencyId) => itemMap.get(dependencyId)?.name)
        .filter(Boolean),
      circularDependency,
      atRisk,
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
  const itemById = new Map(scheduledItems.map((item) => [item.id, item]));

  return scheduledItems.flatMap((item) =>
    item.dependencyIds.map((dependencyId) => {
      const dependency = itemById.get(dependencyId);

      if (!dependency) {
        return null;
      }

      return {
        id: `${dependencyId}-${item.id}`,
        from: dependency.name,
        to: item.name,
        note: `${dependency.name} completes before ${item.name} can advance.`,
      };
    }),
  ).filter(Boolean);
}

function buildExecutiveSummaries(preparedInitiatives, scheduledItems, preparedMilestones) {
  return preparedInitiatives.map((initiative) => {
    const items = scheduledItems
      .filter((item) => item.initiative?.id === initiative.id)
      .sort((left, right) => left.startIndex - right.startIndex);
    const milestones = preparedMilestones.filter(
      (milestone) => milestone.initiative?.id === initiative.id,
    );
    const themes = initiative.theme || "Core delivery";
    const risks = items.filter((item) => item.atRisk);
    const nowItem = items[0];
    const nextItem = items[1];
    const laterItem = items[items.length - 1];

    return {
      id: initiative.id,
      title: initiative.name,
      theme: themes,
      bullets: [
        `Enable ${themes.toLowerCase()} outcomes from ${initiative.quarterRange} with a narrative anchored on ${initiative.narrative.toLowerCase()}`,
        nowItem
          ? `Now: ${nowItem.name}. ${nextItem ? `Next: ${nextItem.name}.` : ""} ${laterItem ? `Later: ${laterItem.name}.` : ""}`.trim()
          : "Now / Next / Later sequencing will appear as soon as work items are added.",
        risks.length > 0
          ? `Leadership watchpoint: ${risks[0].name} is flagged at risk because timeline pressure or dependency ordering pushes it beyond the target window.`
          : `Dependency posture is stable across ${items.length} scheduled work item${items.length === 1 ? "" : "s"}.`,
        milestones.length > 0
          ? `Milestones: ${milestones.map((milestone) => `${milestone.quarter} - ${milestone.label}`).join(" | ")}`
          : "Milestones can be added to sharpen quarter-by-quarter communication.",
      ],
    };
  });
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
    id: `initiative-${Date.now()}-${index}`,
    name: "",
    startDate: "",
    endDate: "",
    theme: "",
    narrative: "",
  };
}

function createEmptyWorkItem(index, initiativeId) {
  return {
    id: `item-${Date.now()}-${index}`,
    initiativeId: initiativeId || "",
    name: "",
    owner: "",
    startDate: "",
    duration: "1",
    status: "Planned",
    dependencyIds: [],
  };
}

function createEmptyMilestone(index, initiativeId) {
  return {
    id: `milestone-${Date.now()}-${index}`,
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
    const dependencyMap = buildDependencyMap(scheduledItems);
    const executiveSummaries = buildExecutiveSummaries(
      preparedInitiatives,
      scheduledItems,
      preparedMilestones,
    );
    const uniqueThemes = Array.from(
      new Set(
        preparedInitiatives
          .map((initiative) => initiative.theme.trim())
          .filter(Boolean),
      ),
    );

    return {
      timeline,
      preparedInitiatives,
      scheduledItems,
      preparedMilestones,
      dependencyMap,
      executiveSummaries,
      uniqueThemes,
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
        initiative.id === initiativeId
          ? { ...initiative, [field]: value }
          : initiative,
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
        milestone.id === milestoneId
          ? { ...milestone, [field]: value }
          : milestone,
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
        createEmptyWorkItem(
          current.workItems.length + 1,
          current.initiatives[0]?.id || "",
        ),
      ],
    }));
  }

  function addMilestone() {
    setState((current) => ({
      ...current,
      milestones: [
        ...current.milestones,
        createEmptyMilestone(
          current.milestones.length + 1,
          current.initiatives[0]?.id || "",
        ),
      ],
    }));
  }

  function removeInitiative(initiativeId) {
    setState((current) => {
      const remainingInitiatives = current.initiatives.filter(
        (initiative) => initiative.id !== initiativeId,
      );
      const fallbackInitiativeId = remainingInitiatives[0]?.id || "";

      return {
        ...current,
        initiatives: remainingInitiatives,
        workItems: current.workItems
          .filter((item) => item.initiativeId !== initiativeId)
          .map((item) => ({
            ...item,
            dependencyIds: item.dependencyIds.filter((dependencyId) =>
              current.workItems.some(
                (workItem) =>
                  workItem.id !== item.id &&
                  workItem.id === dependencyId &&
                  workItem.initiativeId !== initiativeId,
              ),
            ),
            initiativeId: item.initiativeId === initiativeId ? fallbackInitiativeId : item.initiativeId,
          })),
        milestones: current.milestones.filter(
          (milestone) => milestone.initiativeId !== initiativeId,
        ),
      };
    });
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
      "roadmap-companion-export.json",
    );
  }

  return (
    <div className="app-shell">
      <header className="hero-band">
        <div className="hero-copy">
          <p className="eyebrow">Delivery Roadmap Creator</p>
          <h1>Build a sleek delivery roadmap from clear inputs.</h1>
          <p className="lede">
            Add initiatives, work items, milestones, and dependencies through
            structured fields, then switch into a wide roadmap view built for
            leadership communication.
          </p>
        </div>

        <div className="hero-card">
          <p className="hero-label">Delivery Roadmap</p>
          <strong>{state.activePage === "input" ? "Input Page" : "Delivery Roadmap"}</strong>
          <p>
            Dates are entered directly and automatically translated into quarter
            labels such as Q1 or Q2 in the roadmap view.
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
                <input
                  name="audience"
                  value={state.audience}
                  onChange={updateRootField}
                />
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
                        Requested Start
                        <input
                          type="date"
                          value={item.startDate}
                          onChange={(event) =>
                            updateWorkItem(item.id, "startDate", event.target.value)
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
                          .map((candidate) => (
                            <option key={candidate.id} value={candidate.id}>
                              {candidate.name || "Unnamed work item"}
                            </option>
                          ))}
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

                      <label className="wide-field">
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
                <h2>What the roadmap will generate</h2>
              </div>
            </div>

            <div className="summary-metric-grid">
              <div className="metric-card">
                <span>Themes</span>
                <strong>{roadmapModel.uniqueThemes.length}</strong>
              </div>
              <div className="metric-card">
                <span>Initiatives</span>
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
                  <span className="theme-pill muted-pill">Add themes in initiatives</span>
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
                Quarter roll-up is calculated from the dates you enter for
                initiatives, work items, and milestones.
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
                  const items = roadmapModel.scheduledItems
                    .filter((item) => item.initiative?.id === initiative.id)
                    .sort((left, right) => left.startIndex - right.startIndex);
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
                                    {active ? (
                                      <span className="bar-fill">{item.status}</span>
                                    ) : null}
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
                  Add dependencies in work items to populate the dependency map.
                </p>
              )}
            </div>
          </section>

          <section className="panel summary-panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Executive Summary</p>
                <h2>Leadership narrative at the bottom</h2>
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
