// API helpers
async function api(endpoint, options = {}) {
  const response = await fetch(`/api${endpoint}`, {
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
    ...options,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Request failed");
  }

  return response.json();
}

// State
let playlists = [];
let videos = [];

// Initialize
document.addEventListener("DOMContentLoaded", async () => {
  await loadData();
  setupEventListeners();
  connectEventSource();
});

async function loadData() {
  try {
    [playlists, videos] = await Promise.all([
      api("/playlists"),
      api("/videos"),
    ]);

    renderPlaylists();
    renderVideos();
    updatePlaylistFilter();
  } catch (error) {
    console.error("Error loading data:", error);
    alert("Failed to load data: " + error.message);
  }
}

function setupEventListeners() {
  // Add playlist form
  document
    .getElementById("add-playlist-form")
    .addEventListener("submit", async (e) => {
      e.preventDefault();
      const url = document.getElementById("playlist-url").value.trim();

      if (!url) return;

      const button = e.target.querySelector('button[type="submit"]');
      const originalText = button.textContent;
      button.textContent = "Adding...";
      button.disabled = true;

      try {
        await api("/playlists", {
          method: "POST",
          body: JSON.stringify({ url }),
        });

        document.getElementById("playlist-url").value = "";
        await loadData();
      } catch (error) {
        alert("Failed to add playlist: " + error.message);
      } finally {
        button.textContent = originalText;
        button.disabled = false;
      }
    });

  // Playlist filter
  document.getElementById("playlist-filter").addEventListener("change", (e) => {
    renderVideos(e.target.value || undefined);
  });
}

function renderPlaylists() {
  const container = document.getElementById("playlists-list");

  if (playlists.length === 0) {
    container.innerHTML =
      '<article class="empty-state">No playlists added yet</article>';
    return;
  }

  container.innerHTML = playlists
    .map((playlist) => {
      const lastChecked = playlist.lastChecked
        ? new Date(playlist.lastChecked).toLocaleString()
        : "Never";

      return `
            <article class="playlist-item ${
              !playlist.enabled ? "disabled" : "enabled"
            }">
                <div class="playlist-info">
                    <div class="playlist-title">${escapeHtml(
                      playlist.title
                    )}</div>
                    <div class="playlist-meta">
                        Last checked: ${lastChecked}
                    </div>
                </div>
                <div class="playlist-actions">
                    <button class="small secondary" onclick="togglePlaylist('${
                      playlist.id
                    }', ${!playlist.enabled})">
                        ${playlist.enabled ? "Disable" : "Enable"}
                    </button>
                    <button class="small error" onclick="deletePlaylist('${
                      playlist.id
                    }')">
                        Delete
                    </button>
                    <button class="small" onclick="syncPlaylist('${
                      playlist.id
                    }')">
                        Sync
                    </button>
                </div>
            </article>
        `;
    })
    .join("");
}

function renderVideos(playlistId) {
  const container = document.getElementById("videos-list");
  const filteredVideos = playlistId
    ? videos.filter((v) => v.playlistId === playlistId)
    : videos;

  if (filteredVideos.length === 0) {
    container.innerHTML =
      '<article class="empty-state">No videos downloaded yet</article>';
    return;
  }

  // Sort by download date, newest first
  const sortedVideos = [...filteredVideos].sort(
    (a, b) => new Date(b.downloadedAt) - new Date(a.downloadedAt)
  );

  container.innerHTML = sortedVideos
    .map((video) => {
      const playlist = playlists.find((p) => p.id === video.playlistId);
      const playlistTitle = playlist ? playlist.title : "Unknown";
      const downloadDate = new Date(video.downloadedAt).toLocaleString();

      return `
            <article>
                <span class="semi-bold">${escapeHtml(video.title)}</span>
                <div class="video-meta">
                    ${playlistTitle} • ${downloadDate}
                    ${
                      video.status === "completed"
                        ? `• <span class="badge badge-success">Downloaded</span>`
                        : ""
                    }
                    ${
                      video.status === "failed"
                        ? `• <span class="badge badge-error">Failed</span>`
                        : ""
                    }
                </div>
                ${
                  video.error
                    ? `<div class="video-error">Error: ${escapeHtml(
                        video.error
                      )}</div>`
                    : ""
                }
            </article>
        `;
    })
    .join("");
}

function updatePlaylistFilter() {
  const select = document.getElementById("playlist-filter");
  const currentValue = select.value;

  select.innerHTML =
    '<option value="">All Playlists</option>' +
    playlists
      .map((p) => `<option value="${p.id}">${escapeHtml(p.title)}</option>`)
      .join("");

  select.value = currentValue;
}

function renderDownloadStatus(data) {
  const statusSection = document.getElementById("download-status");
  const activeContainer = document.getElementById("active-downloads");
  const queueContainer = document.getElementById("queue-status");

  if (data.active.length === 0 && data.queueLength === 0) {
    statusSection.classList.add("hidden");
    return;
  }

  statusSection.classList.remove("hidden");

  // Render active downloads
  if (data.active.length > 0) {
    console.log("Active downloads:", data.active);
    activeContainer.innerHTML = data.active
      .map(
        (download) => `
            <article>
                <p class="semi-bold">${escapeHtml(download.title)}</p>
                <progress value="${download.progress}" max="100"></progress>
            </article>
        `
      )
      .join("");
  } else {
    activeContainer.innerHTML = "";
  }

  // Render queue status
  if (data.queueLength > 0) {
    queueContainer.innerHTML = `
        <hr />
        <span class="badge badge-warning">${data.queueLength} in queue</span>
        `;
  } else {
    queueContainer.innerHTML = "";
  }
}

function connectEventSource() {
  const eventSource = new EventSource("/api/events");

  eventSource.addEventListener("message", (e) => {
    const data = JSON.parse(e.data);

    if (data.type === "downloads") {
      renderDownloadStatus(data);
    }
  });

  eventSource.addEventListener("error", () => {
    console.error("EventSource connection error");
    // Automatically reconnects
  });
}

// Playlist actions
async function togglePlaylist(id, enabled) {
  try {
    await api(`/playlists/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ enabled }),
    });

    await loadData();
  } catch (error) {
    alert("Failed to update playlist: " + error.message);
  }
}

async function syncPlaylist(id) {
  try {
    await api("/sync", {
      method: "POST",
      body: JSON.stringify({ playlistId: id }),
    });
    await loadData();
  } catch (error) {
    alert("Failed to start sync: " + error.message);
  }
}

async function deletePlaylist(id) {
  if (
    !confirm(
      "Are you sure you want to delete this playlist? This will also remove all associated videos from the database."
    )
  ) {
    return;
  }

  try {
    await api(`/playlists/${id}`, {
      method: "DELETE",
    });

    await loadData();
  } catch (error) {
    alert("Failed to delete playlist: " + error.message);
  }
}

async function syncAll() {
  try {
    await api("/sync", {
      method: "POST",
      body: JSON.stringify({}),
    });
    await loadData();
  } catch (error) {
    alert("Failed to start sync: " + error.message);
  }
}

// Utilities
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
