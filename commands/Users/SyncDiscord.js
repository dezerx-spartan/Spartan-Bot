const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { getConfig } = require('../link.js');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Ensure data directory exists
const dataDir = path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Initialize SQLite database for synced users
const db = new sqlite3.Database(path.join(dataDir, 'config.db'), (err) => {
  if (err) {
    console.error('Error opening database:', err);
  } else {
    // Create synced users table
    db.run(`CREATE TABLE IF NOT EXISTS synced_users (
      guild_id TEXT NOT NULL,
      discord_id TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      role TEXT NOT NULL,
      synced_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (guild_id, discord_id)
    )`);
  }
});

module.exports = {
  name: 'syncdiscord',
  data: new SlashCommandBuilder()
    .setName('syncdiscord')
    .setDescription('Sync your Discord account with Spartan panel')
    .setDefaultMemberPermissions(PermissionFlagsBits.SendMessages),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const guildId = interaction.guildId;
    const discordId = interaction.user.id;
    const discordUsername = interaction.user.username;

    // Get API configuration
    const config = await getConfig(guildId);

    if (!config) {
      const errorEmbed = new EmbedBuilder()
        .setColor('#ff6b6b')
        .setTitle('⚙️ Initial Setup Required')
        .setDescription('The Spartan API has not been configured for this server yet.')
        .addFields({
          name: '🔧 Setup Instructions',
          value: 'A Discord Administrator needs to run `/link` first to configure the API credentials.'
        })
        .setTimestamp();

      await interaction.editReply({ embeds: [errorEmbed] });
      return;
    }

    // Fetch all users from API
    const result = await fetchAllUsers(config.api_url, config.api_key);

    if (!result.success) {
      const errorEmbed = new EmbedBuilder()
        .setColor('#ff0000')
        .setTitle('❌ Failed to Fetch Users')
        .setDescription('Unable to retrieve users from the Spartan API.')
        .addFields({ name: '⚠️ Error', value: result.error })
        .setTimestamp();

      await interaction.editReply({ embeds: [errorEmbed] });
      return;
    }

    // Find user with matching Discord ID
    const matchedUser = result.users.find(user => user.discord_id === discordId);

    if (!matchedUser) {
      // Get the API URL from the config
      const apiUrl = config ? config.api_url : 'https://market.dezerx.com';

      const errorEmbed = new EmbedBuilder()
        .setColor('#ff6b6b')
        .setTitle('❌ Discord Account Not Linked')
        .setDescription('Your Discord account is not linked to any Spartan panel account.')
        .addFields(
          { name: '🆔 Your Discord ID', value: `\`${discordId}\``, inline: false },
          {
            name: '📝 How to Link',
            value: `Go to [Profile Page](${apiUrl}/profile?tab=social) to link your Discord account.`,
            inline: false
          }
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [errorEmbed] });
      return;
    }

    // Save synced user to database
    await saveSyncedUser(guildId, discordId, matchedUser.id, matchedUser.admin_role?.name || 'user');

    // Determine role emoji
    const roleEmoji = matchedUser.admin_role?.name === 'superadmin' ? '⭐' :
      matchedUser.admin_role?.name === 'admin' ? '👑' :
        matchedUser.admin_role?.name === 'moderator' ? '🛡️' : '👤';

    const isAdmin = matchedUser.admin_role?.name === 'superadmin' || matchedUser.admin_role?.name === 'admin';

    // Success embed
    const successEmbed = new EmbedBuilder()
      .setColor('#00ff00')
      .setTitle('✅ Discord Account Synced')
      .setDescription(`Successfully synced your Discord account with Spartan panel!`)
      .addFields(
        { name: '👤 Spartan Username', value: matchedUser.name, inline: true },
        { name: '📧 Email', value: matchedUser.email, inline: true },
        { name: '🛡️ Role', value: `${roleEmoji} ${matchedUser.admin_role?.display_name || 'User'}`, inline: true },
        { name: '🆔 Panel User ID', value: `\`${matchedUser.id}\``, inline: true },
        { name: '🆔 Discord ID', value: `\`${discordId}\``, inline: true },
        { name: '✅ Verified', value: matchedUser.email_verified_at ? 'Yes' : 'No', inline: true }
      )
      .setTimestamp()
      .setFooter({ text: 'Sync completed successfully' });

    if (isAdmin) {
      successEmbed.addFields({
        name: '🔑 Admin Access Granted',
        value: 'You now have access to:\n• `/users` - View all users\n• `/updateuser` - Update user information\n• `/link` - Configure API credentials',
        inline: false
      });
    }

    await interaction.editReply({ embeds: [successEmbed] });
  }
};

// Fetch all users from API
async function fetchAllUsers(apiUrl, apiKey) {
  try {
    let allUsers = [];
    let currentPage = 1;
    let lastPage = 1;

    // Fetch all pages
    do {
      const params = new URLSearchParams({
        page: currentPage.toString(),
        per_page: '100'
      });

      const response = await fetch(`${apiUrl}/api/application/users?${params}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        return {
          success: false,
          error: `HTTP ${response.status}: ${response.statusText}`
        };
      }

      const data = await response.json();

      if (!data.success) {
        return {
          success: false,
          error: 'API returned success: false'
        };
      }

      allUsers = allUsers.concat(data.data.data);
      lastPage = data.data.last_page;
      currentPage++;
    } while (currentPage <= lastPage);

    return {
      success: true,
      users: allUsers
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

// Save synced user to database
function saveSyncedUser(guildId, discordId, userId, role) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO synced_users (guild_id, discord_id, user_id, role, synced_at) 
       VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(guild_id, discord_id) DO UPDATE SET 
       user_id = excluded.user_id,
       role = excluded.role,
       synced_at = CURRENT_TIMESTAMP`,
      [guildId, discordId, userId, role],
      (err) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });
}

// Get synced user from database
function getSyncedUser(guildId, discordId) {
  return new Promise((resolve, reject) => {
    db.get(
      'SELECT * FROM synced_users WHERE guild_id = ? AND discord_id = ?',
      [guildId, discordId],
      (err, row) => {
        if (err) reject(err);
        else resolve(row);
      }
    );
  });
}

// Check if user is admin
async function isUserAdmin(guildId, discordId) {
  const syncedUser = await getSyncedUser(guildId, discordId);
  if (!syncedUser) return false;
  return syncedUser.role === 'superadmin' || syncedUser.role === 'superadmin';
}

// Export helper functions
module.exports.getSyncedUser = getSyncedUser;
module.exports.isUserAdmin = isUserAdmin;