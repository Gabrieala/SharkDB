/**
 * SharkDB - Core Web Application Logic
 * Integrates database, routing, visual stats (Chart.js), and RAG chat.
 * Connects dynamic Wikipedia search triggers, global statistics, and "Cast the Net" discovery.
 */

window.SharkApp = {
  activeView: "dashboard",
  currentUser: null,
  activeCharts: {}, // Keep references to destroy/redraw charts
  dynamicSharks: [], // Store temporary Wikipedia fetched sharks

  init() {
    // Initialize dynamicSharks array explicitly
    window.SharkApp.dynamicSharks = [];

    // 1. Load dynamic cached sharks from LocalStorage
    const cachedDynamic = localStorage.getItem("sharkdb_dynamic_sharks");
    if (cachedDynamic) {
      try {
        window.SharkApp.dynamicSharks = JSON.parse(cachedDynamic);
      } catch (e) {
        window.SharkApp.dynamicSharks = [];
      }
    }

    // 2. Initialize AI search index
    window.SharkAI.initSearchIndex();

    // 3. Setup event listeners
    window.addEventListener("hashchange", () => window.SharkApp.handleRouting());
    window.SharkApp.bindAppEvents();

    // 4. Initial route check
    window.SharkApp.handleRouting();

    // 5. Update API Key indicator
    window.SharkApp.updateApiStatusIndicator();
  },

  // Helper: filter out deleted preloaded species
  _getActiveLocalDatabase() {
    const deletedIds = JSON.parse(localStorage.getItem("sharkdb_deleted_preloaded") || "[]");
    const rawSharks = window.SHARK_DATABASE || [];
    return rawSharks.filter(s => !deletedIds.includes(s.id));
  },

  // 1. ROUTING SYSTEM
  handleRouting() {
    const hash = window.location.hash || "#dashboard";
    window.SharkApp.currentUser = window.SharkAuth.getCurrentUser();

    // Ensure the application container is visible and active
    const appContainer = document.getElementById("app-container");
    if (appContainer) {
      appContainer.classList.add("active");
    }

    const cleanHash = hash.replace("#", "");
    window.SharkApp.activeView = cleanHash;

    document.querySelectorAll(".nav-links li, .mobile-nav a").forEach(el => el.classList.remove("active"));
    
    const desktopNavItem = document.getElementById(`nav-${cleanHash}`);
    if (desktopNavItem) desktopNavItem.classList.add("active");
    const mobileNavItem = document.getElementById(`mnav-${cleanHash}`);
    if (mobileNavItem) mobileNavItem.classList.add("active");

    document.querySelectorAll(".view-section").forEach(sec => sec.classList.remove("active"));
    const activeSection = document.getElementById(`view-${cleanHash}`);
    if (activeSection) {
      activeSection.classList.add("active");
    }

    window.SharkApp.renderViewContent(cleanHash);
  },

  renderViewContent(viewName) {
    const pageTitle = document.getElementById("header-page-title");
    pageTitle.textContent = viewName.charAt(0).toUpperCase() + viewName.slice(1);

    if (window.SharkApp.currentUser) {
      document.getElementById("sidebar-username").textContent = window.SharkApp.currentUser.username;
      document.getElementById("sidebar-email").textContent = window.SharkApp.currentUser.email;
    }

    switch (viewName) {
      case "dashboard":
        window.SharkApp.renderDashboard();
        break;
      case "explore":
        window.SharkApp.renderExplore();
        break;
      case "favorites":
        window.SharkApp.renderFavorites();
        break;
      case "stats":
        window.SharkApp.renderStats();
        break;
      case "chat":
        window.SharkApp.renderChat();
        break;
      case "docs":
        break;
    }
  },

  debounce(func, delay) {
    let timeoutId;
    return (...args) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        func.apply(this, args);
      }, delay);
    };
  },

  // 2. MAIN APP EVENTS
  bindAppEvents() {
    // 1. Detail Modal close
    document.getElementById("modal-close").addEventListener("click", () => {
      document.getElementById("detail-modal").classList.remove("active");
    });
    document.getElementById("detail-modal").addEventListener("click", (e) => {
      if (e.target === document.getElementById("detail-modal")) {
        document.getElementById("detail-modal").classList.remove("active");
      }
    });

    // 2. Settings Modal Toggle
    const apiIndicator = document.getElementById("api-indicator");
    const settingsModal = document.getElementById("settings-modal");
    const settingsClose = document.getElementById("settings-close");

    apiIndicator.addEventListener("click", () => {
      settingsModal.classList.add("active");
      document.getElementById("api-key-input").value = window.SharkAI.getApiKey();
    });

    settingsClose.addEventListener("click", () => {
      settingsModal.classList.remove("active");
    });

    settingsModal.addEventListener("click", (e) => {
      if (e.target === settingsModal) {
        settingsModal.classList.remove("active");
      }
    });

    document.getElementById("settings-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const keyVal = document.getElementById("api-key-input").value.trim();
      window.SharkAI.saveApiKey(keyVal);
      settingsModal.classList.remove("active");
      window.SharkApp.updateApiStatusIndicator();
      alert("Settings saved successfully!");
    });

    document.getElementById("btn-export-profile").addEventListener("click", () => {
      if (window.SharkApp.currentUser) {
        window.SharkAuth.exportUserProfile(window.SharkApp.currentUser.username);
      }
    });

    document.getElementById("btn-import-trigger").addEventListener("click", () => {
      document.getElementById("profile-import-file").click();
    });

    document.getElementById("profile-import-file").addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        const result = window.SharkAuth.importUserProfile(event.target.result);
        if (result.success) {
          alert(`Research data backup loaded successfully!`);
          settingsModal.classList.remove("active");
          window.SharkApp.renderViewContent(window.SharkApp.activeView);
        } else {
          alert(result.message);
        }
      };
      reader.readAsText(file);
      e.target.value = "";
    });

    // 3. Explore Filters & Dynamic Debounced Online Search
    const searchInput = document.getElementById("explore-search");
    const threatFilter = document.getElementById("filter-threat");
    const statusFilter = document.getElementById("filter-status");

    const triggerFilters = () => {
      window.SharkApp.filterExploreGrid(searchInput.value, threatFilter.value, statusFilter.value);
    };

    const debouncedOnlineSearch = window.SharkApp.debounce(async (val) => {
      const q = val.trim();
      if (q.length < 3) return;

      const localDB = window.SharkApp._getActiveLocalDatabase();
      const combinedDatabase = [...localDB, ...window.SharkApp.dynamicSharks];
      const match = combinedDatabase.some(s => 
        s.name.toLowerCase().includes(q.toLowerCase()) || 
        s.scientificName.toLowerCase().includes(q.toLowerCase())
      );

      if (!match) {
        const spinner = document.getElementById("explore-search-spinner");
        if (spinner) spinner.style.display = "block";

        const shark = await window.SharkAI.fetchWikipediaSharkData(q);
        
        if (spinner) spinner.style.display = "none";

        const warningEl = document.getElementById("search-warning");

        if (shark) {
          if (warningEl) warningEl.style.display = "none";
          if (!window.SharkApp.dynamicSharks.some(s => s.id === shark.id)) {
            window.SharkApp.dynamicSharks.push(shark);
            localStorage.setItem("sharkdb_dynamic_sharks", JSON.stringify(window.SharkApp.dynamicSharks));
          }
          window.SharkApp.renderExplore();
          window.SharkApp.filterExploreGrid(val, threatFilter.value, statusFilter.value);
          if (warningEl) {
            warningEl.style.display = "flex";
          }
        }
      }
    }, 600);

    searchInput.addEventListener("input", (e) => {
      const warningEl = document.getElementById("search-warning");
      if (warningEl && e.target.value.trim().length === 0) {
        warningEl.style.display = "none";
      }
      triggerFilters();
      debouncedOnlineSearch(e.target.value);
    });

    threatFilter.addEventListener("change", triggerFilters);
    statusFilter.addEventListener("change", triggerFilters);

    // 4. Cast the Net discovery handlers
    const castDashboard = document.getElementById("btn-cast-net-dashboard");
    if (castDashboard) {
      castDashboard.addEventListener("click", () => window.SharkApp.castNet());
    }

    const castExplore = document.getElementById("btn-cast-net-explore");
    if (castExplore) {
      castExplore.addEventListener("click", () => window.SharkApp.castNet());
    }

    // 5. Chat Send Message
    const chatInput = document.getElementById("chat-message-input");
    const chatSendBtn = document.getElementById("btn-chat-send");

    const sendMessage = () => {
      const text = chatInput.value.trim();
      if (!text) return;
      window.SharkApp.handleUserChatMessage(text);
      chatInput.value = "";
    };

    chatSendBtn.addEventListener("click", sendMessage);
    chatInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") sendMessage();
    });

    // 6. Suggested Prompts
    document.querySelectorAll(".prompt-pill").forEach(pill => {
      pill.addEventListener("click", (e) => {
        const text = e.target.textContent.replace(/"/g, "").trim();
        window.SharkApp.handleUserChatMessage(text);
      });
    });

    // 7. Clear History
    document.getElementById("btn-clear-history").addEventListener("click", () => {
      if (confirm("Are you sure you want to clear your conversation history?")) {
        const profile = window.SharkAuth.getUserProfile(window.SharkApp.currentUser.username);
        if (profile) {
          profile.chatHistory = [];
          window.SharkAuth.updateUserProfile(window.SharkApp.currentUser.username, profile);
          document.getElementById("chat-messages-container").innerHTML = "";
          window.SharkApp.appendWelcomeChatMessage();
        }
      }
    });

    // 8. Restore Defaults
    const btnReset = document.getElementById("btn-reset-database");
    if (btnReset) {
      btnReset.addEventListener("click", () => window.SharkApp.resetDatabase());
    }
  },

  // 4. VIEW RENDERING: DASHBOARD
  renderDashboard() {
    const localDB = window.SharkApp._getActiveLocalDatabase();
    const combined = [...localDB, ...window.SharkApp.dynamicSharks];
    const date = new Date();
    const index = combined.length > 0 ? (date.getFullYear() + date.getMonth() + date.getDate()) % combined.length : 0;
    const sod = combined[index] || {
      id: "none",
      name: "Biological Database Empty",
      scientificName: "Oceanography registry",
      description: "Data loading fallback is active.",
      behavior: "N/A",
      sources: []
    };

    const sodContainer = document.getElementById("sod-container");
    sodContainer.innerHTML = `
      <div class="card-header-gradient" style="height:auto; padding:0 0 15px 0;">
        <span style="font-size: 0.8rem; text-transform: uppercase; color: var(--primary); font-weight: 700; display: block; margin-bottom: 6px;"><i class="fas fa-award"></i> Shark of the Day</span>
        <h2 style="font-size:1.8rem; color:var(--text-white);">${sod.name}</h2>
        <span style="font-style:italic; color:var(--text-muted); font-size:0.9rem;">${sod.scientificName}</span>
      </div>
      <p style="margin-bottom:15px; font-size:0.95rem; line-height:1.6; color:var(--text-light);">${sod.description}</p>
      <div style="background:rgba(4,12,24,0.4); padding:15px; border-radius:12px; border:1px solid var(--border); margin-bottom:15px;">
        <span style="font-size:0.8rem; text-transform:uppercase; color:var(--primary); font-weight:700; display:block; margin-bottom:4px;">Behavioral Insight</span>
        <p style="font-size:0.9rem; line-height:1.5; font-style:italic;">"${sod.behavior}"</p>
      </div>
      <button class="btn-primary" style="margin-top:0; padding:10px 20px; font-size:0.9rem; width:auto;" onclick="window.SharkApp.openDetailModal('${sod.id}')">Explore Biological Profile</button>
    `;

    // Resilient fallback for Global Stats (fixes browser cache crash)
    const stats = window.SHARK_GLOBAL_STATS || {
      totalSpecies: 512,
      totalThreatened: 150,
      percentThreatened: "31%",
      iucnDistribution: {
        "Critically Endangered": 35,
        "Endangered": 48,
        "Vulnerable": 67,
        "Near Threatened": 85,
        "Least Concern": 137,
        "Data Deficient": 140
      }
    };

    const statsGrid = document.getElementById("dashboard-stats-grid");
    statsGrid.innerHTML = `
      <div class="stat-box">
        <div class="num">${stats.totalSpecies}</div>
        <div class="lbl">Known Species (Global)</div>
      </div>
      <div class="stat-box" style="border-color:rgba(255, 62, 62, 0.25);">
        <div class="num" style="color:var(--status-endangered);">${stats.totalThreatened}</div>
        <div class="lbl">Globally Threatened</div>
      </div>
      <div class="stat-box" style="border-color:rgba(255, 145, 0, 0.25);">
        <div class="num" style="color:var(--status-vulnerable);">${stats.percentThreatened}</div>
        <div class="lbl">Threatened ratio (WWF)</div>
      </div>
    `;

    const recContainer = document.getElementById("recommended-showcase");
    const profile = window.SharkAuth.getUserProfile(window.SharkApp.currentUser.username);
    const favs = profile ? profile.favorites : [];

    let showcaseHtml = "";
    if (favs.length > 0) {
      const favoriteSharks = [...localDB, ...window.SharkApp.dynamicSharks].filter(s => favs.includes(s.id));
      showcaseHtml = `<p style="font-size:0.9rem; color:var(--text-muted); margin-bottom:12px;">Your Bookmarked Species:</p>
      <div style="display:flex; gap:10px; flex-wrap:wrap;">`;
      favoriteSharks.forEach(s => {
        showcaseHtml += `
          <button class="prompt-pill" style="display:flex; align-items:center; gap:6px;" onclick="window.SharkApp.openDetailModal('${s.id}')">
            ⭐ ${s.name}
          </button>
        `;
      });
      showcaseHtml += `</div>`;
    } else {
      const recommendations = localDB.filter(s => ["great-white", "whale-shark", "shortfin-mako"].includes(s.id));
      showcaseHtml = `<p style="font-size:0.9rem; color:var(--text-muted); margin-bottom:12px;">Featured species for analysis:</p>
      <div style="display:flex; gap:10px; flex-wrap:wrap;">`;
      recommendations.forEach(s => {
        showcaseHtml += `
          <button class="prompt-pill" style="display:flex; align-items:center; gap:6px;" onclick="window.SharkApp.openDetailModal('${s.id}')">
            🔍 ${s.name}
          </button>
        `;
      });
      showcaseHtml += `</div>`;
    }
    recContainer.innerHTML = showcaseHtml;
  },

  // 5. VIEW RENDERING: EXPLORE
  renderExplore() {
    const grid = document.getElementById("explore-grid");
    const profile = window.SharkAuth.getUserProfile(window.SharkApp.currentUser.username);
    const favs = profile ? profile.favorites : [];

    const localDB = window.SharkApp._getActiveLocalDatabase();
    const combinedDatabase = [...localDB, ...window.SharkApp.dynamicSharks];
    
    let html = "";
    combinedDatabase.forEach(shark => {
      const isFav = favs.includes(shark.id);
      const threatClass = shark.threatLevel.toLowerCase();
      const statusClass = shark.conservationStatus.toLowerCase().replace(" ", "-");

      html += `
        <div class="shark-card" id="shark-card-${shark.id}" onclick="window.SharkApp.handleCardClick(event, '${shark.id}')">
          <div class="card-header-gradient" style="height:auto; padding:15px 20px; display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border);">
            <span style="font-size: 0.75rem; font-family: var(--font-mono); color: var(--primary); border: 1px solid var(--border); padding: 2px 8px; border-radius: 20px; background: rgba(3, 10, 22, 0.4);">
              ${shark.maxSpeedKmh} km/h
            </span>
            <div style="display:flex; align-items:center; gap:8px;">
              ${shark.isDynamic ? `<span style="font-size: 0.65rem; color: var(--accent); border: 1px solid rgba(157, 78, 221, 0.3); padding: 2px 6px; border-radius: 4px; font-weight:700; text-transform:uppercase;">Wikipedia</span>` : ""}
              <button class="fav-btn ${isFav ? 'active' : ''}" style="position:static; background:none; border:none; padding:4px; font-size:1.1rem;" onclick="window.SharkApp.toggleFavorite(event, '${shark.id}')">
                <i class="${isFav ? 'fas' : 'far'} fa-star"></i>
              </button>
              <button class="delete-btn" style="position:static; background:none; border:none; padding:4px; font-size:1rem; color:var(--text-muted); cursor:pointer;" onclick="window.SharkApp.deleteShark(event, '${shark.id}')" title="Delete Species">
                <i class="far fa-trash-can"></i>
              </button>
            </div>
          </div>
          <div class="card-body" style="padding-top:15px;">
            <div class="shark-title">${shark.name}</div>
            <div class="shark-sub">${shark.scientificName}</div>
            <div class="card-desc">${shark.description}</div>
            <div class="badge-row" style="margin-top:auto;">
              <span class="badge badge-status ${statusClass}">${shark.conservationStatus}</span>
              <span class="badge badge-threat ${threatClass}">Threat: ${shark.threatLevel}</span>
            </div>
          </div>
        </div>
      `;
    });

    grid.innerHTML = html;
  },

  filterExploreGrid(searchQuery, threatLevel, conservationStatus) {
    const q = searchQuery.toLowerCase().trim();
    const localDB = window.SharkApp._getActiveLocalDatabase();
    const combinedDatabase = [...localDB, ...window.SharkApp.dynamicSharks];

    combinedDatabase.forEach(shark => {
      const card = document.getElementById(`shark-card-${shark.id}`);
      if (!card) return;

      const nameMatch = shark.name.toLowerCase().includes(q) || shark.scientificName.toLowerCase().includes(q) || shark.description.toLowerCase().includes(q);
      const threatMatch = !threatLevel || shark.threatLevel === threatLevel;
      const statusMatch = !conservationStatus || shark.conservationStatus === conservationStatus;

      if (nameMatch && threatMatch && statusMatch) {
        card.style.display = "flex";
      } else {
        card.style.display = "none";
      }
    });
  },

  // 6. VIEW RENDERING: FAVORITES
  renderFavorites() {
    const grid = document.getElementById("favorites-grid");
    const emptyState = document.getElementById("favorites-empty-state");
    const profile = window.SharkAuth.getUserProfile(window.SharkApp.currentUser.username);
    const favs = profile ? profile.favorites : [];

    const localDB = window.SharkApp._getActiveLocalDatabase();
    const combinedDatabase = [...localDB, ...window.SharkApp.dynamicSharks];
    const favoriteSharks = combinedDatabase.filter(s => favs.includes(s.id));

    if (favoriteSharks.length === 0) {
      grid.innerHTML = "";
      emptyState.style.display = "block";
      return;
    }

    emptyState.style.display = "none";
    let html = "";
    
    favoriteSharks.forEach(shark => {
      const threatClass = shark.threatLevel.toLowerCase();
      const statusClass = shark.conservationStatus.toLowerCase().replace(" ", "-");

      html += `
        <div class="shark-card" onclick="window.SharkApp.handleCardClick(event, '${shark.id}')">
          <div class="card-header-gradient" style="height:auto; padding:15px 20px; display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border);">
            <span style="font-size: 0.75rem; font-family: var(--font-mono); color: var(--primary); border: 1px solid var(--border); padding: 2px 8px; border-radius: 20px; background: rgba(3, 10, 22, 0.4);">
              ${shark.maxSpeedKmh} km/h
            </span>
            <div style="display:flex; align-items:center; gap:8px;">
              ${shark.isDynamic ? `<span style="font-size: 0.65rem; color: var(--accent); border: 1px solid rgba(157, 78, 221, 0.3); padding: 2px 6px; border-radius: 4px; font-weight:700; text-transform:uppercase;">Wikipedia</span>` : ""}
              <button class="fav-btn active" style="position:static; background:none; border:none; padding:4px; font-size:1.1rem;" onclick="window.SharkApp.toggleFavorite(event, '${shark.id}')">
                <i class="fas fa-star"></i>
              </button>
              <button class="delete-btn" style="position:static; background:none; border:none; padding:4px; font-size:1rem; color:var(--text-muted); cursor:pointer;" onclick="window.SharkApp.deleteShark(event, '${shark.id}')" title="Delete Species">
                <i class="far fa-trash-can"></i>
              </button>
            </div>
          </div>
          <div class="card-body" style="padding-top:15px;">
            <div class="shark-title">${shark.name}</div>
            <div class="shark-sub">${shark.scientificName}</div>
            <div class="card-desc">${shark.description}</div>
            <div class="badge-row" style="margin-top:auto;">
              <span class="badge badge-status ${statusClass}">${shark.conservationStatus}</span>
              <span class="badge badge-threat ${threatClass}">Threat: ${shark.threatLevel}</span>
            </div>
          </div>
        </div>
      `;
    });

    grid.innerHTML = html;
  },

  // 7. VIEW RENDERING: STATISTICS
  renderStats() {
    const localDB = window.SharkApp._getActiveLocalDatabase();
    const labels = localDB.map(s => s.name.replace(" Shark", ""));
    const speeds = localDB.map(s => s.maxSpeedKmh);
    const sizes = localDB.map(s => s.maxSizeM);

    // Resilient fallback for Global IUCN distributions
    const globalCounts = (window.SHARK_GLOBAL_STATS && window.SHARK_GLOBAL_STATS.iucnDistribution) || {
      "Critically Endangered": 35,
      "Endangered": 48,
      "Vulnerable": 67,
      "Near Threatened": 85,
      "Least Concern": 137,
      "Data Deficient": 140
    };
    const statusLabels = Object.keys(globalCounts);
    const statusData = Object.values(globalCounts);

    const chartBlue = "#00f2fe";
    const chartPurple = "#9d4edd";
    const statusColors = {
      "Critically Endangered": "#ef4444",
      "Endangered": "#f87171",
      "Vulnerable": "#fb923c",
      "Near Threatened": "#fbbf24",
      "Least Concern": "#34d399",
      "Data Deficient": "#94a3b8"
    };
    const statusColorsArray = statusLabels.map(lbl => statusColors[lbl] || "#cbd5e1");

    Object.values(window.SharkApp.activeCharts).forEach(chart => {
      if (chart) chart.destroy();
    });

    // Speed Chart
    const ctxSpeed = document.getElementById("chart-speed").getContext("2d");
    window.SharkApp.activeCharts.speed = new Chart(ctxSpeed, {
      type: "bar",
      data: {
        labels: labels,
        datasets: [{
          label: "Maximum Speed (km/h)",
          data: speeds,
          backgroundColor: chartBlue,
          borderColor: chartBlue,
          borderWidth: 1,
          borderRadius: 6
        }]
      },
      options: window.SharkApp.getChartOptions("Top Speed Comparison (km/h) - Preloaded Catalog")
    });

    // Size Chart
    const ctxSize = document.getElementById("chart-size").getContext("2d");
    window.SharkApp.activeCharts.size = new Chart(ctxSize, {
      type: "bar",
      data: {
        labels: labels,
        datasets: [{
          label: "Maximum Size (meters)",
          data: sizes,
          backgroundColor: chartPurple,
          borderColor: chartPurple,
          borderWidth: 1,
          borderRadius: 6
        }]
      },
      options: window.SharkApp.getChartOptions("Maximum Size Comparison (meters) - Preloaded Catalog")
    });

    // Conservation Status Pie Chart
    const ctxStatus = document.getElementById("chart-conservation").getContext("2d");
    window.SharkApp.activeCharts.status = new Chart(ctxStatus, {
      type: "doughnut",
      data: {
        labels: statusLabels,
        datasets: [{
          data: statusData,
          backgroundColor: statusColorsArray,
          borderWidth: 2,
          borderColor: "#071329"
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: "right",
            labels: {
              color: "#e2e8f0",
              font: { family: "Outfit" }
            }
          }
        }
      }
    });
  },

  getChartOptions(title) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false
        }
      },
      scales: {
        y: {
          grid: {
            color: "rgba(255, 255, 255, 0.05)"
          },
          ticks: {
            color: "#94a3b8",
            font: { family: "Space Grotesk" }
          }
        },
        x: {
          grid: {
            display: false
          },
          ticks: {
            color: "#94a3b8",
            font: { family: "Space Grotesk", size: 9 },
            maxRotation: 45,
            minRotation: 45
          }
        }
      }
    };
  },

  // 8. VIEW RENDERING: CHAT
  renderChat() {
    const container = document.getElementById("chat-messages-container");
    container.innerHTML = "";

    const profile = window.SharkAuth.getUserProfile(window.SharkApp.currentUser.username);
    if (!profile) return;

    if (profile.chatHistory && profile.chatHistory.length > 0) {
      profile.chatHistory.forEach(msg => {
        window.SharkApp.renderChatMessage(msg.sender, msg.text, msg.engine, msg.citations, false);
      });
      window.SharkApp.scrollToBottom();
    } else {
      window.SharkApp.appendWelcomeChatMessage();
    }
  },

  appendWelcomeChatMessage() {
    window.SharkApp.renderChatMessage(
      "ai", 
      `Hello! I am **SharkDB**, your expert AI marine biologist. \n\n` +
      `I can search through our database of **500+ shark species** to answer your questions accurately, citing Wikipedia, the Shark Research Institute, and WWF.\n\n` +
      `Ask me anything, like:\n` +
      `*   *"Compare the Great White and Tiger Shark"* \n` +
      `*   *"Tell me about the Cookiecutter Shark"* (fetches details dynamically)\n` +
      `*   *"Which sharks are dangerous to humans?"*`,
      "System",
      null,
      false
    );
  },

  async handleUserChatMessage(query) {
    window.SharkApp.renderChatMessage("user", query, null, null, true);
    window.SharkApp.scrollToBottom();

    const loaderId = window.SharkApp.renderChatLoader();
    window.SharkApp.scrollToBottom();

    const result = await window.SharkAI.askQuestion(query);

    if (result.retrievedSharks) {
      let changed = false;
      result.retrievedSharks.forEach(shark => {
        if (shark.isDynamic && !window.SharkApp.dynamicSharks.some(s => s.id === shark.id)) {
          window.SharkApp.dynamicSharks.push(shark);
          changed = true;
        }
      });
      if (changed) {
        localStorage.setItem("sharkdb_dynamic_sharks", JSON.stringify(window.SharkApp.dynamicSharks));
      }
    }

    document.getElementById(loaderId).remove();
    window.SharkApp.renderChatMessage("ai", result.answer, result.engine, result.citations, true);
    window.SharkApp.scrollToBottom();
  },

  renderChatLoader() {
    const container = document.getElementById("chat-messages-container");
    const loaderId = "loader-" + Date.now();

    const loaderDiv = document.createElement("div");
    loaderDiv.id = loaderId;
    loaderDiv.className = "message-bubble ai";
    loaderDiv.innerHTML = `
      <div class="message-meta">
        <span>SharkDB is retrieving...</span>
      </div>
      <div class="ai-loader">
        <div class="loader-dot"></div>
        <div class="loader-dot"></div>
        <div class="loader-dot"></div>
      </div>
    `;
    container.appendChild(loaderDiv);
    return loaderId;
  },

  renderChatMessage(sender, text, engine = null, citations = null, saveToHistory = false) {
    const container = document.getElementById("chat-messages-container");

    const messageDiv = document.createElement("div");
    messageDiv.className = `message-bubble ${sender}`;

    let metaHtml = "";
    if (sender === "ai") {
      metaHtml = `
        <div class="message-meta">
          <span>SharkDB Bio-Agent</span>
          ${engine ? `<span class="engine-tag">${engine}</span>` : ""}
        </div>
      `;
    } else {
      metaHtml = `
        <div class="message-meta" style="justify-content: flex-end;">
          <span>You</span>
        </div>
      `;
    }

    const formattedText = window.SharkApp.parseMarkdown(text);

    let citationHtml = "";
    if (citations) {
      citationHtml = `
        <div class="citation-block">
          <strong>Verified Context Sources:</strong><br>
          ${window.SharkApp.parseMarkdown(citations)}
        </div>
      `;
    }

    messageDiv.innerHTML = metaHtml + formattedText + citationHtml;
    container.appendChild(messageDiv);

    if (saveToHistory) {
      const profile = window.SharkAuth.getUserProfile(window.SharkApp.currentUser.username);
      if (profile) {
        if (!profile.chatHistory) profile.chatHistory = [];
        profile.chatHistory.push({
          sender,
          text,
          engine,
          citations,
          timestamp: new Date().toISOString()
        });
        window.SharkAuth.updateUserProfile(window.SharkApp.currentUser.username, profile);
      }
    }
  },

  scrollToBottom() {
    const container = document.getElementById("chat-messages-container");
    container.scrollTop = container.scrollHeight;
  },

  parseMarkdown(md) {
    if (!md) return "";
    let html = md;

    html = html
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    const lines = html.split("\n");
    let isTable = false;
    let tableHtml = "";
    let cleanLines = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith("|") && line.endsWith("|")) {
        if (line.includes("---") || line.includes(":-")) {
          if (!isTable) isTable = true;
          continue;
        }

        const cells = line.split("|").slice(1, -1).map(c => c.trim());
        let rowHtml = "";
        
        if (!isTable) {
          isTable = true;
          rowHtml = "<tr>" + cells.map(c => `<th>${window.SharkApp._parseInlineMarkdown(c)}</th>`).join("") + "</tr>";
          tableHtml += "<thead>" + rowHtml + "</thead><tbody>";
        } else {
          rowHtml = "<tr>" + cells.map(c => `<td>${window.SharkApp._parseInlineMarkdown(c)}</td>`).join("") + "</tr>";
          tableHtml += rowHtml;
        }
      } else {
        if (isTable) {
          tableHtml += "</tbody>";
          cleanLines.push(`<table>${tableHtml}</table>`);
          isTable = false;
          tableHtml = "";
        }
        cleanLines.push(line);
      }
    }
    
    if (isTable) {
      tableHtml += "</tbody>";
      cleanLines.push(`<table>${tableHtml}</table>`);
    }

    html = cleanLines.join("\n");

    html = html.replace(/^#### (.*$)/gim, "<h5 style='color:var(--primary); font-size:0.95rem; margin-top:12px; margin-bottom:4px;'>$1</h5>");
    html = html.replace(/^### (.*$)/gim, "<h4 style='color:var(--primary); font-size:1.1rem; margin-top:14px; margin-bottom:6px;'>$1</h4>");
    html = html.replace(/^## (.*$)/gim, "<h3 style='color:var(--text-white); font-size:1.3rem; margin-top:16px; margin-bottom:8px;'>$1</h3>");
    html = html.replace(/^# (.*$)/gim, "<h2 style='color:var(--text-white); font-size:1.6rem; margin-top:18px; margin-bottom:10px;'>$1</h2>");

    html = html
      .replace(/&lt;table/g, "<table")
      .replace(/table&gt;/g, "table>")
      .replace(/&lt;\/table&gt;/g, "</table>")
      .replace(/&lt;thead/g, "<thead")
      .replace(/thead&gt;/g, "thead>")
      .replace(/&lt;\/thead&gt;/g, "</thead>")
      .replace(/&lt;tbody/g, "<tbody")
      .replace(/tbody&gt;/g, "tbody>")
      .replace(/&lt;\/tbody&gt;/g, "</tbody>")
      .replace(/&lt;tr/g, "<tr")
      .replace(/tr&gt;/g, "tr>")
      .replace(/&lt;\/tr&gt;/g, "</tr>")
      .replace(/&lt;th/g, "<th")
      .replace(/th&gt;/g, "th>")
      .replace(/&lt;\/th&gt;/g, "</th>")
      .replace(/&lt;td/g, "<td")
      .replace(/td&gt;/g, "td>")
      .replace(/&lt;\/td&gt;/g, "</td>");

    html = html.replace(/^\&gt; (.*$)/gim, "<blockquote>$1</blockquote>");
    html = html.replace(/```([\s\S]*?)```/gm, "<pre><code>$1</code></pre>");
    html = html.replace(/^\s*[\-\*]\s+(.*$)/gim, "<li>$1</li>");
    html = html.replace(/(<li>.*<\/li>)/gim, "<ul>$1</ul>");
    html = html.replace(/<\/ul>\s*<ul>/g, "");

    html = window.SharkApp._parseInlineMarkdown(html);
    html = html.replace(/\n/g, "<br>");

    html = html
      .replace(/<\/ul><br>/g, "</ul>")
      .replace(/<\/table><br>/g, "</table>")
      .replace(/<\/blockquote><br>/g, "</blockquote>")
      .replace(/<\/pre><br>/g, "</pre>")
      .replace(/<br><li>/g, "<li>");

    return html;
  },

  _parseInlineMarkdown(text) {
    return text
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.*?)\*/g, "<em>$1</em>")
      .replace(/`(.*?)`/g, "<code>$1</code>")
      .replace(/\\`(.*?)\\`/g, "<code>$1</code>");
  },

  // 9. EVENT HANDLERS FOR CARD INTERACTION & FAVORITES
  handleCardClick(event, sharkId) {
    if (event.target.closest(".fav-btn") || event.target.closest(".delete-btn")) {
      return;
    }
    window.SharkApp.openDetailModal(sharkId);
  },

  openDetailModal(sharkId) {
    const localDB = window.SharkApp._getActiveLocalDatabase();
    const combinedDatabase = [...localDB, ...window.SharkApp.dynamicSharks];
    const shark = combinedDatabase.find(s => s.id === sharkId);
    if (!shark) return;

    const modal = document.getElementById("detail-modal");
    
    document.getElementById("modal-title").innerHTML = `
      ${shark.name} <span style="font-size: 1rem; color: var(--text-muted); font-style: italic;">(${shark.scientificName})</span>
    `;

    document.getElementById("modal-stat-size").textContent = `${shark.maxSizeM} m`;
    document.getElementById("modal-stat-weight").textContent = `${shark.maxWeightKg.toLocaleString()} kg`;
    document.getElementById("modal-stat-speed").textContent = `${shark.maxSpeedKmh} km/h`;
    document.getElementById("modal-stat-depth").textContent = shark.depthRangeM;

    document.getElementById("modal-desc").textContent = shark.description;
    document.getElementById("modal-behavior").textContent = shark.behavior;
    
    document.getElementById("modal-diet-habitat").innerHTML = `
      <p><strong>Diet:</strong> ${shark.diet}</p>
      <p style="margin-top: 8px;"><strong>Habitats:</strong> ${shark.habitats.join(", ")}</p>
    `;

    const threatClass = shark.threatLevel.toLowerCase();
    document.getElementById("modal-safety").innerHTML = `
      <p><strong>Threat Rating:</strong> <span class="badge badge-threat ${threatClass}">${shark.threatLevel}</span></p>
      <p style="margin-top: 8px; line-height: 1.5;">${shark.threatReason}</p>
    `;

    const statusClass = shark.conservationStatus.toLowerCase().replace(" ", "-");
    document.getElementById("modal-conservation").innerHTML = `
      <p><strong>IUCN Red List Status:</strong> <span class="badge badge-status ${statusClass}">${shark.conservationStatus}</span></p>
      <p style="margin-top: 8px; line-height: 1.5;">${shark.conservationDetails}</p>
    `;

    document.getElementById("modal-fact").textContent = `"${shark.coolFact}"`;

    const sourceList = shark.sources.map(s => `<li>${s}</li>`).join("");
    document.getElementById("modal-sources").innerHTML = `<ul>${sourceList}</ul>`;

    modal.classList.add("active");
  },

  toggleFavorite(event, sharkId) {
    event.stopPropagation();
    
    const profile = window.SharkAuth.getUserProfile(window.SharkApp.currentUser.username);
    if (!profile) return;

    const favIndex = profile.favorites.indexOf(sharkId);
    let isAdded = false;

    if (favIndex === -1) {
      profile.favorites.push(sharkId);
      isAdded = true;
    } else {
      profile.favorites.splice(favIndex, 1);
    }

    window.SharkAuth.updateUserProfile(window.SharkApp.currentUser.username, profile);

    const btns = document.querySelectorAll(`#shark-card-${sharkId} .fav-btn, button[onclick*="${sharkId}"]`);
    btns.forEach(btn => {
      if (isAdded) {
        btn.classList.add("active");
      } else {
        btn.classList.remove("active");
      }
    });

    if (window.SharkApp.activeView === "favorites") {
      window.SharkApp.renderFavorites();
    } else if (window.SharkApp.activeView === "dashboard") {
      window.SharkApp.renderDashboard();
    }
  },

  // Discovery cast net helper
  async castNet() {
    const extraSharks = [
      "Goblin shark", "Frilled shark", "Ninja lanternshark", "Cookiecutter shark", 
      "Bramble shark", "Megamouth shark", "Basking shark", "Thresher shark", 
      "Blue shark", "Sand tiger shark", "Greenland shark", "Angel shark", 
      "Horn shark", "Wobbegong shark", "Port Jackson shark", "Swellshark", 
      "Salmon shark", "Porbeagle", "Silky shark", "Dusky shark", 
      "Blacktip shark", "Lemon shark", "Bull shark", "Spiny dogfish",
      "Epaulette shark", "Catshark", "Carpet shark", "Nurse shark"
    ];

    const localDB = window.SharkApp._getActiveLocalDatabase();
    const combined = [...localDB, ...window.SharkApp.dynamicSharks];

    const roll = Math.random();
    let selectedShark = null;

    if (roll < 0.4) {
      const candidate = extraSharks[Math.floor(Math.random() * extraSharks.length)];
      const loadedMatch = combined.find(s => s.name.toLowerCase().includes(candidate.toLowerCase()));
      
      if (loadedMatch) {
        selectedShark = loadedMatch;
      } else {
        const btnDashboard = document.getElementById("btn-cast-net-dashboard");
        const btnExplore = document.getElementById("btn-cast-net-explore");
        
        const originalDashboardHtml = btnDashboard ? btnDashboard.innerHTML : "";
        const originalExploreHtml = btnExplore ? btnExplore.innerHTML : "";

        if (btnDashboard) {
          btnDashboard.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Sinking net...`;
          btnDashboard.disabled = true;
        }
        if (btnExplore) {
          btnExplore.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Casting net...`;
          btnExplore.disabled = true;
        }

        selectedShark = await window.SharkAI.fetchWikipediaSharkData(candidate);

        if (btnDashboard) {
          btnDashboard.innerHTML = originalDashboardHtml;
          btnDashboard.disabled = false;
        }
        if (btnExplore) {
          btnExplore.innerHTML = originalExploreHtml;
          btnExplore.disabled = false;
        }

        if (selectedShark) {
          if (!window.SharkApp.dynamicSharks.some(s => s.id === selectedShark.id)) {
            window.SharkApp.dynamicSharks.push(selectedShark);
            localStorage.setItem("sharkdb_dynamic_sharks", JSON.stringify(window.SharkApp.dynamicSharks));
          }
          window.SharkApp.renderExplore();
        }
      }
    }

    if (!selectedShark) {
      if (combined.length > 0) {
        const randomIndex = Math.floor(Math.random() * combined.length);
        selectedShark = combined[randomIndex];
      }
    }

    if (selectedShark) {
      window.SharkApp.openDetailModal(selectedShark.id);
    } else {
      alert("The net came up empty! Try casting again.");
    }
  },

  // Delete card from registry (local or preloaded list)
  deleteShark(event, sharkId) {
    event.stopPropagation();
    const localDB = window.SharkApp._getActiveLocalDatabase();
    const combined = [...localDB, ...window.SharkApp.dynamicSharks];
    const shark = combined.find(s => s.id === sharkId);
    if (!shark) return;

    if (confirm(`Are you sure you want to permanently delete "${shark.name}" from your terminal registry?`)) {
      // 1. Remove from bookmarks
      const profile = window.SharkAuth.getUserProfile(window.SharkApp.currentUser.username);
      if (profile) {
        const favIndex = profile.favorites.indexOf(sharkId);
        if (favIndex !== -1) {
          profile.favorites.splice(favIndex, 1);
          window.SharkAuth.updateUserProfile(window.SharkApp.currentUser.username, profile);
        }
      }

      // 2. Remove from dynamic list or add to deleted preloaded list
      const dynIndex = window.SharkApp.dynamicSharks.findIndex(s => s.id === sharkId);
      if (dynIndex !== -1) {
        window.SharkApp.dynamicSharks.splice(dynIndex, 1);
        localStorage.setItem("sharkdb_dynamic_sharks", JSON.stringify(window.SharkApp.dynamicSharks));
      } else {
        const deletedPreloaded = JSON.parse(localStorage.getItem("sharkdb_deleted_preloaded") || "[]");
        if (!deletedPreloaded.includes(sharkId)) {
          deletedPreloaded.push(sharkId);
          localStorage.setItem("sharkdb_deleted_preloaded", JSON.stringify(deletedPreloaded));
        }
      }

      // 3. Recompute TF-IDF search index
      window.SharkAI.initSearchIndex();

      // 4. Re-render active view content
      window.SharkApp.renderViewContent(window.SharkApp.activeView);
    }
  },

  // Restore factory defaults
  resetDatabase() {
    if (confirm("Are you sure you want to restore all preloaded shark database defaults and clear dynamic searches?")) {
      localStorage.removeItem("sharkdb_deleted_preloaded");
      localStorage.removeItem("sharkdb_dynamic_sharks");
      window.SharkApp.dynamicSharks = [];
      
      // Re-initialize search index
      window.SharkAI.initSearchIndex();

      // Re-render views
      window.SharkApp.renderViewContent(window.SharkApp.activeView);
      alert("Database successfully restored to factory defaults!");
    }
  },

  updateApiStatusIndicator() {
    const indicator = document.getElementById("api-indicator");
    const label = indicator.querySelector("span");
    const dot = indicator.querySelector(".status-dot");
    const key = window.SharkAI.getApiKey();

    if (key) {
      label.textContent = "Gemini RAG Mode Active";
      dot.classList.add("active");
    } else {
      label.textContent = "Offline Local AI Active";
      dot.classList.remove("active");
    }
  }
};
