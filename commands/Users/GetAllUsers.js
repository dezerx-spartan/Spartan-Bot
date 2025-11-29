const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getConfig } = require('../link.js');

module.exports = {
  name: 'users',
  data: new SlashCommandBuilder()
    .setName('users')
    .setDescription('Get all users from Spartan API')
    .addStringOption(option =>
      option.setName('search')
        .setDescription('Search for users by name or email')
        .setRequired(false)
    ),
  
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const guildId = interaction.guildId;
    const discordId = interaction.user.id;
    const search = interaction.options.getString('search') || '';
    const perPage = 4; // Fixed at 4 users per page

    // Check if user is admin
    const { isUserAdmin } = require('./SyncDiscord.js');
    const isAdmin = await isUserAdmin(guildId, discordId);

    if (!isAdmin) {
      const errorEmbed = new EmbedBuilder()
        .setColor('#ff0000')
        .setTitle('🔒 Access Denied')
        .setDescription('You need admin privileges to use this command.')
        .addFields({ 
          name: '💡 How to gain access', 
          value: 'Run `/syncdiscord` to sync your account. Only users with **Admin** or **Super Admin** roles in the Spartan panel can access this command.' 
        })
        .setTimestamp();

      await interaction.editReply({ embeds: [errorEmbed] });
      return;
    }

    // Get API configuration
    const config = await getConfig(guildId);

    if (!config) {
      const errorEmbed = new EmbedBuilder()
        .setColor('#ff0000')
        .setTitle('❌ No Configuration Found')
        .setDescription('Please run `/link` first to configure your Spartan API credentials.')
        .setTimestamp();

      await interaction.editReply({ embeds: [errorEmbed] });
      return;
    }

    // Fetch users from API
    const result = await fetchUsers(config.api_url, config.api_key, 1, perPage, search);

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

    // Create embed and pagination buttons
    const { embed, components } = createUserEmbed(result.data, search, perPage, guildId, false);

    await interaction.editReply({ embeds: [embed], components });
  }
};

// Handle pagination and show all button clicks
module.exports.handlePagination = async (interaction) => {
  if (!interaction.customId.startsWith('users_')) return;

  await interaction.deferUpdate();

  const guildId = interaction.guildId;
  let currentPage, itemsPerPage, searchQuery, showAll;

  if (interaction.customId.startsWith('users_showall_')) {
    const [, , guildIdFromButton, search] = interaction.customId.split('_');
    currentPage = 1;
    itemsPerPage = 100; // Max allowed by API
    searchQuery = search === 'none' ? '' : decodeURIComponent(search);
    showAll = true;
  } else {
    // Parse button type (first, prev, next, last, page)
    const parts = interaction.customId.split('_');
    const buttonType = parts[1]; // first, prev, next, last, or page
    
    let targetPage;
    let perPage;
    let search;
    
    if (buttonType === 'first') {
      // users_first_4_guildId_search
      targetPage = 1;
      perPage = parts[2];
      search = parts[4];
    } else if (buttonType === 'last') {
      // users_last_4_guildId_search - need to fetch to get last page
      perPage = parts[2];
      search = parts[4];
      searchQuery = search === 'none' ? '' : decodeURIComponent(search);
      
      // Fetch first page to get total pages
      const config = await getConfig(guildId);
      if (!config) {
        const errorEmbed = new EmbedBuilder()
          .setColor('#ff0000')
          .setTitle('❌ Configuration Lost')
          .setDescription('API configuration not found. Please run `/link` again.')
          .setTimestamp();
        await interaction.editReply({ embeds: [errorEmbed], components: [] });
        return;
      }
      
      const tempResult = await fetchUsers(config.api_url, config.api_key, 1, parseInt(perPage), searchQuery);
      if (!tempResult.success) {
        const errorEmbed = new EmbedBuilder()
          .setColor('#ff0000')
          .setTitle('❌ Failed to Fetch')
          .setDescription('Unable to retrieve users from the Spartan API.')
          .addFields({ name: '⚠️ Error', value: tempResult.error })
          .setTimestamp();
        await interaction.editReply({ embeds: [errorEmbed], components: [] });
        return;
      }
      
      targetPage = tempResult.data.last_page;
    } else if (buttonType === 'prev') {
      // users_prev_2_4_guildId_search
      const currentPageNum = parseInt(parts[2]);
      targetPage = currentPageNum - 1;
      perPage = parts[3];
      search = parts[5];
    } else if (buttonType === 'next') {
      // users_next_1_4_guildId_search
      const currentPageNum = parseInt(parts[2]);
      targetPage = currentPageNum + 1;
      perPage = parts[3];
      search = parts[5];
    } else {
      // users_page_1_4_guildId_search (fallback for old format)
      targetPage = parseInt(parts[2]);
      perPage = parts[3];
      search = parts[5];
    }
    
    currentPage = targetPage;
    itemsPerPage = parseInt(perPage);
    searchQuery = search === 'none' ? '' : decodeURIComponent(search);
    showAll = false;
  }

  // Get API configuration
  const config = await getConfig(guildId);

  if (!config) {
    const errorEmbed = new EmbedBuilder()
      .setColor('#ff0000')
      .setTitle('❌ Configuration Lost')
      .setDescription('API configuration not found. Please run `/link` again.')
      .setTimestamp();

    await interaction.editReply({ embeds: [errorEmbed], components: [] });
    return;
  }

  // Fetch users for the requested page
  const result = await fetchUsers(config.api_url, config.api_key, currentPage, itemsPerPage, searchQuery);

  if (!result.success) {
    const errorEmbed = new EmbedBuilder()
      .setColor('#ff0000')
      .setTitle('❌ Failed to Fetch Page')
      .setDescription('Unable to retrieve users from the Spartan API.')
      .addFields({ name: '⚠️ Error', value: result.error })
      .setTimestamp();

    await interaction.editReply({ embeds: [errorEmbed], components: [] });
    return;
  }

  // Update embed with new page
  const { embed, components } = createUserEmbed(result.data, searchQuery, itemsPerPage, guildId, showAll);

  await interaction.editReply({ embeds: [embed], components });
};

// Fetch users from API
async function fetchUsers(apiUrl, apiKey, page, perPage, search) {
  try {
    const params = new URLSearchParams({
      page: page.toString(),
      per_page: perPage.toString()
    });

    if (search) {
      params.append('search', search);
    }

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

    return {
      success: true,
      data: data.data
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

// Create user embed with pagination
function createUserEmbed(data, search, perPage, guildId, showAll) {
  const { current_page, last_page, total, from, to } = data;
  const users = data.data;

  const embed = new EmbedBuilder()
    .setColor('#2b2d31')
    .setTitle('👥 Spartan Users')
    .setTimestamp();

  // Add search info if searching
  if (search) {
    embed.setDescription(`🔍 **Search Results for:** \`${search}\``);
  }

  if (users.length === 0) {
    embed.addFields({ 
      name: '📭 No Users Found', 
      value: 'No users match your search criteria.' 
    });
    embed.setFooter({ text: `Total: 0 users` });
  } else {
    // Add user fields with better formatting
    users.forEach((user) => {
      const roleEmoji = user.admin_role?.name === 'superadmin' ? '⭐' :
                        user.admin_role?.name === 'admin' ? '👑' : 
                        user.admin_role?.name === 'moderator' ? '🛡️' : '👤';
      
      const verifiedBadge = user.email_verified_at ? '✅' : '⏳';
      
      const roleName = user.admin_role?.display_name || 'User';
      
      const fieldValue = [
        `> **Email:** \`${user.email}\` ${verifiedBadge}`,
        `> **Role:** ${roleEmoji} ${roleName}`,
        `> **ID:** \`${user.id}\``,
        `> **Joined:** <t:${Math.floor(new Date(user.created_at).getTime() / 1000)}:R>`
      ].join('\n');

      embed.addFields({
        name: `\u200b`,
        value: `${user.name}\n${fieldValue}`,
        inline: false
      });
    });

    // Set footer based on view mode
    if (showAll) {
      embed.setFooter({ text: `Showing all ${total} users` });
    } else {
      embed.setFooter({ 
        text: `Page ${current_page} of ${last_page} • Total: ${total} users • Showing ${from}-${to}` 
      });
    }
  }

  // Create pagination buttons
  const components = [];
  
  if (users.length > 0 && !showAll && last_page > 1) {
    const searchParam = search ? encodeURIComponent(search) : 'none';
    
    const buttons = [];
    
    const firstButton = new ButtonBuilder()
      .setCustomId(`users_first_${perPage}_${guildId}_${searchParam}`)
      .setLabel('First')
      .setEmoji('⏮️')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(current_page === 1);

    const prevButton = new ButtonBuilder()
      .setCustomId(`users_prev_${current_page}_${perPage}_${guildId}_${searchParam}`)
      .setLabel('Previous')
      .setEmoji('◀️')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(current_page === 1);

    const pageButton = new ButtonBuilder()
      .setCustomId(`page_indicator_${current_page}`)
      .setLabel(`${current_page} / ${last_page}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true);

    const nextButton = new ButtonBuilder()
      .setCustomId(`users_next_${current_page}_${perPage}_${guildId}_${searchParam}`)
      .setLabel('Next')
      .setEmoji('▶️')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(current_page === last_page);

    const lastButton = new ButtonBuilder()
      .setCustomId(`users_last_${perPage}_${guildId}_${searchParam}`)
      .setLabel('Last')
      .setEmoji('⏭️')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(current_page === last_page);

    const row1 = new ActionRowBuilder().addComponents(
      firstButton,
      prevButton,
      pageButton,
      nextButton,
      lastButton
    );

    components.push(row1);
  }

  // Add "Show All" button if not already showing all and there are users
  if (users.length > 0 && !showAll) {
    const searchParam = search ? encodeURIComponent(search) : 'none';
    
    const showAllButton = new ButtonBuilder()
      .setCustomId(`users_showall_${guildId}_${searchParam}`)
      .setLabel('Show All Users')
      .setEmoji('📋')
      .setStyle(ButtonStyle.Success);

    // If there's pagination, add to second row, otherwise first row
    if (components.length > 0) {
      const row2 = new ActionRowBuilder().addComponents(showAllButton);
      components.push(row2);
    } else {
      const row = new ActionRowBuilder().addComponents(showAllButton);
      components.push(row);
    }
  }

  // Add "Back to Paginated" button if showing all
  if (showAll) {
    const searchParam = search ? encodeURIComponent(search) : 'none';
    
    const backButton = new ButtonBuilder()
      .setCustomId(`users_first_4_${guildId}_${searchParam}`)
      .setLabel('Back to Paginated View')
      .setEmoji('↩️')
      .setStyle(ButtonStyle.Secondary);

    const row = new ActionRowBuilder().addComponents(backButton);
    components.push(row);
  }

  return { embed, components };
}