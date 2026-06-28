/**
 * SharkDB - Guest Session and Data Management
 * Handles guest researcher sessions, data persistence, and backup utility functions.
 */

window.SharkAuth = {
  // Key names for local storage
  PROFILE_KEY: "sharkdb_guest_profile",

  // Simplified session: always returns Guest Researcher details
  getCurrentUser() {
    return {
      username: "Guest Researcher",
      email: "guest@sharkdb.com",
      loginTime: new Date().toISOString()
    };
  },

  logout() {
    // No login/logout overlays, returns true safely
    return true;
  },

  // Retrieve full guest profile (bookmarks, chat history)
  getUserProfile(username) {
    const data = localStorage.getItem(this.PROFILE_KEY);
    if (!data) {
      // Create a default initial guest profile
      const defaultProfile = {
        username: "Guest Researcher",
        email: "guest@sharkdb.com",
        favorites: ["great-white", "whale-shark", "shortfin-mako"],
        chatHistory: [],
        createdAt: new Date().toISOString()
      };
      this.updateUserProfile(null, defaultProfile);
      return defaultProfile;
    }
    try {
      return JSON.parse(data);
    } catch (e) {
      return null;
    }
  },

  // Save guest profile changes (like favorites or chat history)
  updateUserProfile(username, updatedProfileData) {
    try {
      const currentProfile = this.getUserProfile(username) || {};
      const newProfile = { ...currentProfile, ...updatedProfileData };
      localStorage.setItem(this.PROFILE_KEY, JSON.stringify(newProfile));
      return true;
    } catch (e) {
      console.error("Failed to save guest profile changes:", e);
      return false;
    }
  },

  // Export guest profile data as a downloadable JSON file
  exportUserProfile(username) {
    const profile = this.getUserProfile(username);
    if (!profile) return false;
    
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(profile, null, 2));
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `sharkdb_research_backup.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    return true;
  },

  // Import guest profile data from uploaded JSON text
  importUserProfile(jsonString) {
    try {
      const importedProfile = JSON.parse(jsonString);
      if (!importedProfile.favorites || !Array.isArray(importedProfile.favorites)) {
        return { success: false, message: "Invalid backup format. Missing favorites array." };
      }

      const mergedProfile = {
        username: "Guest Researcher",
        email: "guest@sharkdb.com",
        favorites: importedProfile.favorites,
        chatHistory: importedProfile.chatHistory || [],
        createdAt: importedProfile.createdAt || new Date().toISOString()
      };

      localStorage.setItem(this.PROFILE_KEY, JSON.stringify(mergedProfile));
      return { success: true, username: "Guest Researcher" };
    } catch (e) {
      return { success: false, message: "Failed to parse JSON file. Ensure it is a valid SharkDB backup." };
    }
  }
};
