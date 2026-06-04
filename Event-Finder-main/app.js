const CENTER = [48.616, 9.45];
const RADIUS_METERS = 50000;

const DEFAULT_MARKER_COLOR = "#007aff";
const ACTIVE_MARKER_COLOR = "#ff3b30";

const map = L.map("map").setView(CENTER, 9);

L.tileLayer(
  "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
  {
    attribution: "&copy; OpenStreetMap"
  }
).addTo(map);

const markersLayer = L.layerGroup().addTo(map);

L.circle(CENTER, {
  radius: RADIUS_METERS,
  color: DEFAULT_MARKER_COLOR,
  fill: false,
  weight: 4
}).addTo(map);

L.circleMarker(CENTER, {
  radius: 8,
  color: DEFAULT_MARKER_COLOR,
  fillColor: DEFAULT_MARKER_COLOR,
  fillOpacity: 1,
  weight: 3
})
.addTo(map)
.bindPopup("Dettingen unter Teck");

const fileInput =
  document.getElementById("eventsFileInput");

const eventsContainer =
  document.getElementById("events");

const adminStatus =
  document.getElementById("adminStatus");

const dataStatus =
  document.getElementById("dataStatus");

const promptText =
  document.getElementById("promptText");

const sharePromptBtn =
  document.getElementById("exportPromptBtn");

const promptFileInput =
  document.getElementById("promptFileInput");

const eventMarkers = [];

let allEvents = [];

let sortedEvents = [];

let currentActiveEventIndex = null;

let selectedEventsFileText = "";

fileInput?.addEventListener(
  "change",
  handleFileUpload
);

promptFileInput?.addEventListener(
  "change",
  handlePromptImport
);

sharePromptBtn?.addEventListener(
  "click",
  sharePrompt
);

map.on(
  "zoomend",
  rebuildMarkersForCurrentZoom
);

init();

async function init(){

  await loadSavedEvents();

  await loadPrompt();
}

async function loadSavedEvents(){

  try{

    const response = await fetch(
      "events.json?v=" + Date.now(),
      {
        cache: "no-store"
      }
    );

    if(!response.ok){

      throw new Error(
        "Keine gespeicherte events.json gefunden"
      );
    }

    const data = await response.json();

    allEvents =
      Array.isArray(data)
      ? data
      : [];

    renderEvents(allEvents);

    dataStatus.textContent =
      allEvents.length +
      " gespeicherte Events geladen.";

  }catch(error){

    console.warn(error);

    dataStatus.textContent =
      "Noch keine gespeicherten Events vorhanden.";

    renderEvents([]);
  }
}

function handleFileUpload(event){

  const file = event.target.files[0];

  if(!file) return;

  const reader = new FileReader();

  reader.onload = async e => {

    try{

      selectedEventsFileText =
        String(e.target.result || "");

      const data =
        JSON.parse(selectedEventsFileText);

      if(!Array.isArray(data)){

        throw new Error(
          "Die Datei enthält keine gültige Event-Liste."
        );
      }

      allEvents = data;

      renderEvents(allEvents);

      dataStatus.textContent =
        allEvents.length +
        " gespeicherte Events geladen.";

      setStatus(
        adminStatus,
        "Events importiert. Speichere automatisch…",
        ""
      );

      await saveEventsToGitHub(allEvents);

      setStatus(
        adminStatus,
        "Events importiert und dauerhaft gespeichert.",
        "ok"
      );

    }catch(error){

      selectedEventsFileText = "";

      setStatus(
        adminStatus,
        "Events konnten nicht gespeichert werden: " + error.message,
        "error"
      );

      console.error(error);
    }
  };

  reader.readAsText(file);
}

async function saveEventsToGitHub(events){

  const response = await fetch(
    "/api/save-events",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(events)
    }
  );

  let result = null;

  try{

    result = await response.json();

  }catch(error){

    result = null;
  }

  if(!response.ok){

    throw new Error(
      result?.error ||
      "Server konnte events.json nicht speichern."
    );
  }

  return result;
}

function handlePromptImport(event){

  const file = event.target.files[0];

  if(!file) return;

  const reader = new FileReader();

  reader.onload = e => {

    try{

      const text =
        String(e.target.result || "");

      promptText.value = text;

      setStatus(
        adminStatus,
        "Suchtext importiert.",
        "ok"
      );

    }catch(error){

      setStatus(
        adminStatus,
        "Suchtext konnte nicht importiert werden.",
        "error"
      );

      console.error(error);
    }
  };

  reader.readAsText(file);
}

async function loadPrompt(){

  try{

    const response = await fetch(
      "prompt.txt?v=" + Date.now(),
      {
        cache: "no-store"
      }
    );

    if(!response.ok){

      throw new Error(
        "Noch kein prompt.txt vorhanden"
      );
    }

    promptText.value =
      await response.text();

  }catch(error){

    promptText.value = "";
  }
}

async function sharePrompt(){

  const text =
    promptText.value || "";

  if(!text.trim()){

    setStatus(
      adminStatus,
      "Kein Suchtext vorhanden.",
      "error"
    );

    return;
  }

  try{

    if(navigator.share){

      await navigator.share({
        title: "Suchanfrage Events",
        text: text
      });

      setStatus(
        adminStatus,
        "Teilen geöffnet.",
        "ok"
      );

      return;
    }

    await navigator.clipboard.writeText(text);

    setStatus(
      adminStatus,
      "Suchtext wurde kopiert.",
      "ok"
    );

  }catch(error){

    setStatus(
      adminStatus,
      "Teilen abgebrochen.",
      ""
    );
  }
}

function hasCoords(event){

  return (
    typeof event.lat === "number" &&
    typeof event.lng === "number" &&
    Number.isFinite(event.lat) &&
    Number.isFinite(event.lng)
  );
}

function getCoordKey(event){

  return [
    Number(event.lat).toFixed(5),
    Number(event.lng).toFixed(5)
  ].join(",");
}

function renderEvents(events){

  markersLayer.clearLayers();

  eventMarkers.length = 0;

  currentActiveEventIndex = null;

  eventsContainer.innerHTML = "";

  if(
    !Array.isArray(events) ||
    events.length === 0
  ){

    sortedEvents = [];

    eventsContainer.innerHTML = `
      <div class="event-card">
        <h3>Keine Events geladen</h3>
      </div>
    `;

    map.setView(CENTER, 9);

    return;
  }

  sortedEvents =
    [...events].sort((a, b) => {

      const da =
        Number(a.distance_km ?? 9999);

      const db =
        Number(b.distance_km ?? 9999);

      return da - db;
    });

  const bounds = [];

  sortedEvents.forEach(
    (event, eventIndex) => {

      if(hasCoords(event)){

        bounds.push([
          event.lat,
          event.lng
        ]);
      }

      renderEventCard(
        event,
        eventIndex
      );
    }
  );

  setupVisibleCardTracking();

  map.setView(
    CENTER,
    9,
    {
      animate: false
    }
  );

  rebuildMarkersForCurrentZoom();
}

function rebuildMarkersForCurrentZoom(){

  markersLayer.clearLayers();

  eventMarkers.length = 0;

  if(
    !Array.isArray(sortedEvents) ||
    sortedEvents.length === 0
  ){
    return;
  }

  const groups =
    createZoomGroups();

  groups.forEach(group => {

    const marker =
      createMarker(group);

    eventMarkers.push(marker);
  });

  updateCardsMarkerIndex(groups);

  highlightActiveEventMarker();
}

function createZoomGroups(){

  const zoom =
    map.getZoom();

  const clusterSize =
    getClusterPixelSize(zoom);

  const groups =
    new Map();

  sortedEvents.forEach(
    (event, eventIndex) => {

      if(!hasCoords(event)){
        return;
      }

      const point =
        map.latLngToLayerPoint([
          event.lat,
          event.lng
        ]);

      const key =
        clusterSize > 0
        ? [
            Math.round(point.x / clusterSize),
            Math.round(point.y / clusterSize)
          ].join(",")
        : getCoordKey(event);

      if(!groups.has(key)){

        groups.set(
          key,
          {
            key: key,
            lat: event.lat,
            lng: event.lng,
            events: [],
            eventIndexes: []
          }
        );
      }

      const group =
        groups.get(key);

      group.events.push(event);

      group.eventIndexes.push(eventIndex);

      group.lat =
        group.events.reduce(
          (sum, item) => sum + item.lat,
          0
        ) / group.events.length;

      group.lng =
        group.events.reduce(
          (sum, item) => sum + item.lng,
          0
        ) / group.events.length;
    }
  );

  return Array.from(
    groups.values()
  );
}

function getClusterPixelSize(zoom){

  if(zoom <= 9){
    return 78;
  }

  if(zoom === 10){
    return 64;
  }

  if(zoom === 11){
    return 50;
  }

  if(zoom === 12){
    return 36;
  }

  return 0;
}

function updateCardsMarkerIndex(groups){

  groups.forEach(
    (group, markerIndex) => {

      group.eventIndexes.forEach(
        eventIndex => {

          const card =
            eventsContainer.querySelector(
              `[data-event-index="${eventIndex}"]`
            );

          if(card){

            card.dataset.markerIndex =
              String(markerIndex);
          }
        }
      );
    }
  );
}

function createMarker(group){

  const marker = L.marker(
    [group.lat, group.lng],
    {
      icon: createEventIcon(
        false,
        group.events.length
      )
    }
  ).addTo(markersLayer);

  marker.groupEventIndexes =
    group.eventIndexes;

  marker.groupCount =
    group.events.length;

  marker.bindPopup(
    createMarkerPopup(group)
  );

  marker.on("click", () => {

    const firstEventIndex =
      marker.groupEventIndexes[0];

    const card =
      eventsContainer.querySelector(
        `[data-event-index="${firstEventIndex}"]`
      );

    if(!card){
      return;
    }

    card.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });

    currentActiveEventIndex =
      firstEventIndex;

    highlightActiveEventMarker();
  });

  return marker;
}

function createMarkerPopup(group){

  const title =
    group.events.length === 1
    ? escapeHtml(group.events[0].title || "")
    : group.events.length + " Events in der Nähe";

  const location =
    escapeHtml(
      group.events[0]?.location || ""
    );

  const list =
    group.events
      .slice(0, 6)
      .map(event => {
        return `
          <div>
            ${escapeHtml(event.title || "")}
          </div>
        `;
      })
      .join("");

  return `
    <b>${title}</b><br>
    ${location}
    ${
      group.events.length > 1
      ? `<hr>${list}`
      : `<br>${escapeHtml(group.events[0]?.date || "")}`
    }
  `;
}

function createEventIcon(
  active,
  count
){

  const color =
    active
    ? ACTIVE_MARKER_COLOR
    : DEFAULT_MARKER_COLOR;

  const hasCount =
    Number(count) > 1;

  const size =
    hasCount
    ? (
        active
        ? 58
        : 52
      )
    : (
        active
        ? 46
        : 40
      );

  const anchorX =
    size / 2;

  const anchorY =
    size;

  const fontSize =
    hasCount
    ? (
        count >= 100
        ? 12
        : count >= 10
        ? 14
        : 16
      )
    : 11;

  return L.divIcon({
    className: "",
    iconSize: [size, size],
    iconAnchor: [anchorX, anchorY],
    popupAnchor: [0, -anchorY + 6],
    html: `
      <svg
        width="${size}"
        height="${size}"
        viewBox="0 0 40 40"
        xmlns="http://www.w3.org/2000/svg"
        style="display:block; filter: drop-shadow(0 3px 6px rgba(0,0,0,0.55));"
      >
        <path
          d="M20 2C12.4 2 6.2 8.2 6.2 15.8C6.2 26.2 20 38 20 38C20 38 33.8 26.2 33.8 15.8C33.8 8.2 27.6 2 20 2Z"
          fill="${color}"
          stroke="#ffffff"
          stroke-width="2"
        />

        ${
          hasCount
          ? `
            <circle
              cx="20"
              cy="15.8"
              r="11"
              fill="#ffffff"
            />

            <text
              x="20"
              y="20.5"
              text-anchor="middle"
              font-size="${fontSize}"
              font-weight="900"
              font-family="Arial, sans-serif"
              fill="${color}"
            >
              ${count}
            </text>
          `
          : `
            <circle
              cx="20"
              cy="15.8"
              r="5.5"
              fill="#ffffff"
            />
          `
        }
      </svg>
    `
  });
}

function renderEventCard(
  event,
  eventIndex
){

  const card =
    document.createElement("div");

  card.className = "event-card";

  card.dataset.eventIndex =
    String(eventIndex);

  const hasPoint =
    hasCoords(event);

  card.innerHTML = `
    <h3>
      ${escapeHtml(event.title || "")}
    </h3>

    <div class="meta">
      ${escapeHtml(event.date || "")}
      ${escapeHtml(event.time || "")}
    </div>

    <div class="distance">
      ${event.distance_km ?? "?"} km
    </div>

    <p>
      ${escapeHtml(event.location || "")}
    </p>

    <p>
      ${escapeHtml(event.description || "")}
    </p>

    ${
      hasPoint
      ? `
        <p class="meta">
          ${event.lat},
          ${event.lng}
        </p>
      `
      : `
        <p class="meta">
          Kein Kartenpunkt vorhanden
        </p>
      `
    }

    <div
      style="
        display:flex;
        gap:8px;
        flex-wrap:wrap;
        margin-top:8px;
      "
    >

      ${
        event.maps
        ? `
          <a
            href="${escapeAttribute(event.maps)}"
            target="_blank"
            rel="noopener"
          >
            Karte öffnen
          </a>
        `
        : ""
      }

      ${
        event.source
        ? `
          <a
            href="${escapeAttribute(event.source)}"
            target="_blank"
            rel="noopener"
          >
            Quelle
          </a>
        `
        : ""
      }

    </div>
  `;

  eventsContainer.appendChild(card);
}

function setupVisibleCardTracking(){

  const cards =
    eventsContainer.querySelectorAll(".event-card");

  const observer =
    new IntersectionObserver(
      entries => {

        let bestEntry = null;

        for(const entry of entries){

          if(!entry.isIntersecting){
            continue;
          }

          if(
            !bestEntry ||
            entry.intersectionRatio >
            bestEntry.intersectionRatio
          ){
            bestEntry = entry;
          }
        }

        if(!bestEntry){
          return;
        }

        const eventIndex =
          Number(bestEntry.target.dataset.eventIndex);

        if(Number.isFinite(eventIndex)){

          currentActiveEventIndex =
            eventIndex;

          highlightActiveEventMarker();
        }
      },
      {
        root: eventsContainer,
        threshold: [0.35, 0.6, 0.9]
      }
    );

  cards.forEach(card => {
    observer.observe(card);
  });
}

function highlightActiveEventMarker(){

  eventMarkers.forEach(marker => {

    const active =
      Array.isArray(marker.groupEventIndexes) &&
      marker.groupEventIndexes.includes(
        currentActiveEventIndex
      );

    marker.setIcon(
      createEventIcon(
        active,
        marker.groupCount || 1
      )
    );

    if(active){

      marker.setZIndexOffset(1000);
    }else{

      marker.setZIndexOffset(0);
    }
  });
}

function setStatus(
  element,
  text,
  type
){

  if(!element){
    return;
  }

  element.textContent = text;

  element.className = "status";

  if(type){

    element.classList.add(type);
  }
}

function escapeHtml(value){

  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value){

  return escapeHtml(value);
}
