const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { getConfig } = require('../link.js');

const slashCommandData = new SlashCommandBuilder()
  .setName('manageservices')
  .setDescription('Manage services in Spartan API')
  .addStringOption(option =>
    option.setName('user_email')
      .setDescription('Filter by user email')
      .setRequired(false)
  )
  .addStringOption(option =>
    option.setName('status')
      .setDescription('Filter by status')
      .setRequired(false)
      .addChoices(
        { name: 'Active', value: 'active' },
        { name: 'Suspended', value: 'suspended' },
        { name: 'Terminated', value: 'terminated' },
        { name: 'Pending', value: 'pending' }
      )
  );

module.exports = {
  name: 'manageservices',
  data: slashCommandData,
  
  async execute(interaction) {
    await interaction.deferReply({ flags: 64 });

    const guildId = interaction.guildId;
    const discordId = interaction.user.id;
    const userEmail = interaction.options.getString('user_email');
    const status = interaction.options.getString('status');

    // Check if user is admin
    const { isUserAdmin } = require('../Users/SyncDiscord.js');
    const isAdmin = await isUserAdmin(guildId, discordId);

    if (!isAdmin) {
      const errorEmbed = new EmbedBuilder()
        .setColor('#ff0000')
        .setTitle('Access Denied')
        .setDescription('You need admin privileges to use this command.')
        .addFields({ 
          name: 'How to gain access', 
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
        .setTitle('No Configuration Found')
        .setDescription('Please run `/link` first to configure your Spartan API credentials.')
        .setTimestamp();

      await interaction.editReply({ embeds: [errorEmbed] });
      return;
    }

    // Fetch services
    const result = await getServices(config.api_url, config.api_key, 1, userEmail, status);

    if (!result.success) {
      const errorEmbed = new EmbedBuilder()
        .setColor('#ff0000')
        .setTitle('Failed to Fetch Services')
        .setDescription('Unable to retrieve services from the API.')
        .addFields({ name: 'Error', value: result.error })
        .setTimestamp();

      await interaction.editReply({ embeds: [errorEmbed] });
      return;
    }

    const { current_page, last_page, total, data: services } = result.data;

    if (services.length === 0) {
      const emptyEmbed = new EmbedBuilder()
        .setColor('#ffaa00')
        .setTitle('No Services Found')
        .setDescription('No services match your search criteria.')
        .setTimestamp();

      await interaction.editReply({ embeds: [emptyEmbed] });
      return;
    }

    // Create embed
    const embed = createServicesEmbed(services, current_page, last_page, total, userEmail, status);

    // Create action buttons
    const components = createActionButtons(services, current_page, last_page, guildId, userEmail, status);

    await interaction.editReply({ embeds: [embed], components });
  }
};

// Create services embed
function createServicesEmbed(services, currentPage, lastPage, total, userEmail, status) {
  const embed = new EmbedBuilder()
    .setColor('#5865F2')
    .setTitle('Service Management')
    .setDescription(`> Showing services from Spartan API\n> **Page ${currentPage} of ${lastPage}** • **Total: ${total}**`)
    .setTimestamp();

  if (userEmail) {
    embed.addFields({ name: 'User Filter', value: `\`${userEmail}\``, inline: true });
  }
  if (status) {
    embed.addFields({ name: 'Status Filter', value: `\`${status}\``, inline: true });
  }

  services.forEach((service, index) => {
    const statusEmoji = getStatusEmoji(service.status);
    const ownerInfo = service.owner?.email || service.owner?.name || 'Unknown';
    const productInfo = service.product?.name || 'N/A';
    const dueDate = service.due_date ? `<t:${Math.floor(new Date(service.due_date).getTime() / 1000)}:D>` : 'N/A';

    embed.addFields({
      name: `${index + 1}. ${service.service_name}`,
      value: `> ${statusEmoji} **Status:** ${service.status}\n> **Price:** $${service.price} (${service.billing_cycle})\n> **Product:** ${productInfo}\n> **Owner:** ${ownerInfo}\n> **Due Date:** ${dueDate}\n> **ID:** \`${service.id}\``,
      inline: false
    });
  });

  embed.setFooter({ text: 'Use the buttons below to manage services or navigate pages' });

  return embed;
}

// Create action buttons
function createActionButtons(services, currentPage, lastPage, guildId, userEmail, status) {
  const components = [];

  // Navigation buttons
  if (lastPage > 1) {
    const navRow = new ActionRowBuilder();

    navRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`services_first_${guildId}_${userEmail || 'none'}_${status || 'none'}`)
        .setLabel('First')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(currentPage === 1),
      new ButtonBuilder()
        .setCustomId(`services_prev_${currentPage}_${guildId}_${userEmail || 'none'}_${status || 'none'}`)
        .setLabel('Previous')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(currentPage === 1),
      new ButtonBuilder()
        .setCustomId(`services_next_${currentPage}_${guildId}_${userEmail || 'none'}_${status || 'none'}`)
        .setLabel('Next')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(currentPage === lastPage),
      new ButtonBuilder()
        .setCustomId(`services_last_${lastPage}_${guildId}_${userEmail || 'none'}_${status || 'none'}`)
        .setLabel('Last')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(currentPage === lastPage)
    );

    components.push(navRow);
  }

  // Service action select menu
  if (services.length > 0) {
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(`service_action_${guildId}`)
      .setPlaceholder('Select a service to manage')
      .addOptions(
        services.map(service => ({
          label: `${service.service_name} (ID: ${service.id})`,
          description: `${service.status} • ${service.product?.name || 'N/A'}`,
          value: `${service.id}_${service.status}`,
          emoji: getStatusEmoji(service.status)
        }))
      );

    const selectRow = new ActionRowBuilder().addComponents(selectMenu);
    components.push(selectRow);
  }

  return components;
}

// Handle pagination
module.exports.handlePagination = async (interaction) => {
  if (!interaction.customId.startsWith('services_')) return;

  await interaction.deferUpdate();

  const parts = interaction.customId.split('_');
  const action = parts[1];
  let page, guildId, userEmail, status;

  if (action === 'first' || action === 'last') {
    guildId = parts[2];
    userEmail = parts[3] === 'none' ? null : parts[3];
    status = parts[4] === 'none' ? null : parts[4];
    page = action === 'first' ? 1 : parseInt(parts[2]);
  } else {
    page = parseInt(parts[2]);
    guildId = parts[3];
    userEmail = parts[4] === 'none' ? null : parts[4];
    status = parts[5] === 'none' ? null : parts[5];
  }

  if (action === 'next') page++;
  if (action === 'prev') page--;
  if (action === 'last') {
    // Get last page from button
    const lastPageMatch = interaction.customId.match(/services_last_(\d+)_/);
    if (lastPageMatch) page = parseInt(lastPageMatch[1]);
  }

  const config = await getConfig(guildId);

  if (!config) {
    await interaction.followUp({ 
      content: 'API configuration not found.', 
      flags: 64
    });
    return;
  }

  const result = await getServices(config.api_url, config.api_key, page, userEmail, status);

  if (!result.success) {
    await interaction.followUp({ 
      content: `Failed to fetch services: ${result.error}`, 
      flags: 64
    });
    return;
  }

  const { current_page, last_page, total, data: services } = result.data;

  const embed = createServicesEmbed(services, current_page, last_page, total, userEmail, status);
  const components = createActionButtons(services, current_page, last_page, guildId, userEmail, status);

  await interaction.editReply({ embeds: [embed], components });
};

// Handle service action selection
module.exports.handleServiceAction = async (interaction) => {
  if (!interaction.customId.startsWith('service_action_')) return;

  const guildId = interaction.customId.split('_')[2];
  
  // Safely parse the selected value
  const selectedValue = interaction.values[0];
  const valueParts = selectedValue.split('_');
  const serviceId = valueParts[0];
  const serviceStatus = valueParts.slice(1).join('_'); // Handle statuses with underscores

  // Fetch the full service details
  const config = await getConfig(guildId);
  
  if (!config) {
    await interaction.reply({
      content: 'API configuration not found.',
      flags: 64
    });
    return;
  }

  const serviceResult = await getServiceById(config.api_url, config.api_key, serviceId);
  
  if (!serviceResult.success) {
    await interaction.reply({
      content: `Failed to fetch service details: ${serviceResult.error}`,
      flags: 64
    });
    return;
  }

  const service = serviceResult.data;
  
  // Create service details embed
  const serviceEmbed = new EmbedBuilder()
    .setColor('#5865F2')
    .setTitle('Service Details')
    .setDescription(`> **${service.service_name}**\n> Select an action below to manage this service`)
    .addFields(
      { name: 'Service ID', value: `\`${service.id}\``, inline: true },
      { name: 'Status', value: `${getStatusEmoji(service.status)} ${service.status}`, inline: true },
      { name: 'Price', value: `$${service.price} (${service.billing_cycle})`, inline: true },
      { name: 'Product', value: service.product?.name || 'N/A', inline: true },
      { name: 'Owner', value: service.owner?.email || service.owner?.name || 'Unknown', inline: true },
      { name: 'Due Date', value: service.due_date ? `<t:${Math.floor(new Date(service.due_date).getTime() / 1000)}:D>` : 'N/A', inline: true }
    )
    .setTimestamp();

  // Create action buttons for the selected service
  const actionRow = new ActionRowBuilder();

  // Normalize status to lowercase for comparison
  const normalizedStatus = serviceStatus.toLowerCase();

  if (normalizedStatus === 'active') {
    const row1 = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`suspend_service_${serviceId}_${guildId}`)
          .setLabel('Suspend')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(`terminate_service_${serviceId}_${guildId}`)
          .setLabel('Terminate')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId('cancel_service_action')
          .setLabel('Cancel')
          .setStyle(ButtonStyle.Secondary)
      );
    
    const row2 = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`change_price_${serviceId}_${guildId}`)
          .setLabel('Change Price')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`change_due_date_${serviceId}_${guildId}`)
          .setLabel('Change Due Date')
          .setStyle(ButtonStyle.Primary)
      );

    await interaction.reply({
      embeds: [serviceEmbed],
      components: [row1, row2],
      flags: 64
    });
    return;
  } else if (normalizedStatus === 'suspended') {
    actionRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`unsuspend_service_${serviceId}_${guildId}`)
        .setLabel('Unsuspend')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`terminate_service_${serviceId}_${guildId}`)
        .setLabel('Terminate')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId('cancel_service_action')
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Secondary)
    );
  } else if (normalizedStatus === 'terminated') {
    actionRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`delete_service_${serviceId}_${guildId}`)
        .setLabel('Delete Permanently')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId('cancel_service_action')
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Secondary)
    );
  } else if (normalizedStatus === 'pending') {
    const row1 = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`activate_service_${serviceId}_${guildId}`)
          .setLabel('Activate')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`terminate_service_${serviceId}_${guildId}`)
          .setLabel('Terminate')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId('cancel_service_action')
          .setLabel('Cancel')
          .setStyle(ButtonStyle.Secondary)
      );
    
    const row2 = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`change_price_${serviceId}_${guildId}`)
          .setLabel('Change Price')
          .setStyle(ButtonStyle.Primary)
      );

    await interaction.reply({
      embeds: [serviceEmbed],
      components: [row1, row2],
      flags: 64
    });
    return;
  } else {
    // Fallback for any other status
    actionRow.addComponents(
      new ButtonBuilder()
        .setCustomId('cancel_service_action')
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Secondary)
    );

    await interaction.reply({
      embeds: [serviceEmbed],
      components: [actionRow],
      flags: 64
    });
    return;
  }

  await interaction.reply({
    embeds: [serviceEmbed],
    components: [actionRow],
    flags: 64
  });
};

// Handle service actions (suspend, unsuspend, terminate, activate)
module.exports.handleServiceActionButton = async (interaction) => {
  const customId = interaction.customId;

  if (customId === 'cancel_service_action') {
    await interaction.update({ 
      content: 'Action cancelled.', 
      embeds: [],
      components: [] 
    });
    return;
  }

  // Handle change price button
  if (customId.startsWith('change_price_')) {
    const parts = customId.split('_');
    const serviceId = parts[2];
    const guildId = parts[3];

    const modal = new ModalBuilder()
      .setCustomId(`price_modal_${serviceId}_${guildId}`)
      .setTitle('Change Service Price');

    const priceInput = new TextInputBuilder()
      .setCustomId('new_price')
      .setLabel('New Price')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('29.99')
      .setRequired(true);

    const priceRow = new ActionRowBuilder().addComponents(priceInput);
    modal.addComponents(priceRow);

    await interaction.showModal(modal);
    return;
  }

  if (customId.startsWith('change_due_date_')) {
    const parts = customId.split('_');
    const serviceId = parts[3];
    const guildId = parts[4];

    const modal = new ModalBuilder()
      .setCustomId(`due_date_modal_${serviceId}_${guildId}`)
      .setTitle('Change Service Due Date');

    const dueDateInput = new TextInputBuilder()
      .setCustomId('new_due_date')
      .setLabel('New Due Date (YYYY-MM-DD)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('2024-12-31')
      .setRequired(true);

    const dueDateRow = new ActionRowBuilder().addComponents(dueDateInput);
    modal.addComponents(dueDateRow);

    await interaction.showModal(modal);
    return;
  }

  if (!customId.includes('_service_')) return;

  try {
    await interaction.deferUpdate();
  } catch (error) {
    console.error('Failed to defer update:', error);
    return;
  }

  const parts = customId.split('_');
  const action = parts[0]; // suspend, unsuspend, terminate, activate
  const serviceId = parts[2];
  const guildId = parts[3];

  console.log(`Action: ${action}, Service ID: ${serviceId}, Guild ID: ${guildId}`);

  const config = await getConfig(guildId);

  if (!config) {
    await interaction.followUp({ 
      content: 'API configuration not found.', 
      flags: 64
    });
    return;
  }

  let result;
  if (action === 'suspend') {
    result = await suspendService(config.api_url, config.api_key, serviceId);
  } else if (action === 'unsuspend') {
    result = await unsuspendService(config.api_url, config.api_key, serviceId);
  } else if (action === 'terminate') {
    result = await terminateService(config.api_url, config.api_key, serviceId);
  } else if (action === 'activate') {
    result = await activateService(config.api_url, config.api_key, serviceId);
  } else if (action === 'delete') {
    result = await deleteService(config.api_url, config.api_key, serviceId);
  } else {
    await interaction.followUp({ 
      content: `Unknown action: ${action}`, 
      flags: 64
    });
    return;
  }

 if (!result || !result.success) {
    console.error(`${action} service failed:`, result.error);
    const errorEmbed = new EmbedBuilder()
      .setColor('#ff0000')
      .setTitle(`Failed to ${action.charAt(0).toUpperCase() + action.slice(1)} Service`)
      .setDescription(`Unable to ${action} service ID: \`${serviceId}\``)
      .addFields({ name: 'Error', value: result.error })
      .setTimestamp();

    await interaction.editReply({ content: '', embeds: [errorEmbed], components: [] });
    return;
  }

  console.log(`${action} service successful:`, result);

  if (action === 'delete') {
    const successEmbed = new EmbedBuilder()
      .setColor('#00ff00')
      .setTitle('Service Deleted Successfully')
      .setDescription(`> ${result.message || 'Service has been deleted permanently.'}`)
      .addFields(
        { name: 'Service ID', value: `\`${serviceId}\``, inline: true }
      )
      .setFooter({ text: 'Refreshing service list...' })
      .setTimestamp();

    await interaction.editReply({ content: '', embeds: [successEmbed], components: [] });
  } else {
    const service = result.data;
    const actionMessage = result.message || `**${service.service_name}** has been ${action}ed.`;

  
   const successEmbed = new EmbedBuilder()
      .setColor('#00ff00')
      .setTitle(`Service ${action.charAt(0).toUpperCase() + action.slice(1)}ed Successfully`)
      .setDescription(`> ${actionMessage}`)
      .addFields(
        { name: 'Service ID', value: `\`${service.id}\``, inline: true },
        { name: 'Product', value: service.product?.name || 'N/A', inline: true },
        { name: 'Status', value: `${getStatusEmoji(service.status)} ${service.status}`, inline: true },
        { name: 'Owner', value: service.owner?.email || service.owner?.name || 'Unknown', inline: true },
        { name: 'Updated', value: `<t:${Math.floor(new Date(service.updated_at).getTime() / 1000)}:R>`, inline: true }
      )
      .setFooter({ text: 'Refreshing service list...' })
      .setTimestamp();

    await interaction.editReply({ content: '', embeds: [successEmbed], components: [] });
  }

  // Wait 2 seconds to show success message, then refresh the service list
  setTimeout(async () => {
    // Fetch updated services list
    const servicesResult = await getServices(config.api_url, config.api_key, 1, null, null);

    if (!servicesResult.success) {
      return; // If refresh fails, just leave the success message
    }

    const { current_page, last_page, total, data: services } = servicesResult.data;

    if (services.length === 0) {
      return; // If no services, leave success message
    }

    // Create refreshed embed and components
    const embed = createServicesEmbed(services, current_page, last_page, total, null, null);
    const components = createActionButtons(services, current_page, last_page, guildId, null, null);

    await interaction.editReply({ embeds: [embed], components });
  }, 2000);
};

// Handle modal submissions for price and due date changes
module.exports.handleModalSubmit = async (interaction) => {
  const customId = interaction.customId;

  // Handle price modal
  if (customId.startsWith('price_modal_')) {
    await interaction.deferReply({ flags: 64 });

    const parts = customId.split('_');
    const serviceId = parts[2];
    const guildId = parts[3];

    const newPrice = interaction.fields.getTextInputValue('new_price');

    const config = await getConfig(guildId);

    if (!config) {
      await interaction.editReply({ 
        content: 'API configuration not found.', 
      });
      return;
    }

    const result = await updateServicePrice(config.api_url, config.api_key, serviceId, newPrice);

    if (!result.success) {
      const errorEmbed = new EmbedBuilder()
        .setColor('#ff0000')
        .setTitle('Failed to Update Price')
        .setDescription(`Unable to update price for service ID: \`${serviceId}\``)
        .addFields({ name: 'Error', value: result.error })
        .setTimestamp();

      await interaction.editReply({ embeds: [errorEmbed] });
      return;
    }

    const service = result.data;
    const successEmbed = new EmbedBuilder()
      .setColor('#00ff00')
      .setTitle('Price Updated Successfully')
      .setDescription(`> **${service.service_name}** price has been updated.`)
      .addFields(
        { name: 'Service ID', value: `\`${service.id}\``, inline: true },
        { name: 'New Price', value: `${service.price}`, inline: true },
        { name: 'Billing Cycle', value: service.billing_cycle, inline: true },
        { name: 'Status', value: `${getStatusEmoji(service.status)} ${service.status}`, inline: true },
        { name: 'Updated', value: `<t:${Math.floor(new Date(service.updated_at).getTime() / 1000)}:R>`, inline: true }
      )
      .setFooter({ text: 'Refreshing service list...' })
      .setTimestamp();

    await interaction.editReply({ embeds: [successEmbed] });

    // Refresh service list after 2 seconds
    setTimeout(async () => {
      const servicesResult = await getServices(config.api_url, config.api_key, 1, null, null);

      if (!servicesResult.success) return;

      const { current_page, last_page, total, data: services } = servicesResult.data;

      if (services.length === 0) return;

      const embed = createServicesEmbed(services, current_page, last_page, total, null, null);
      const components = createActionButtons(services, current_page, last_page, guildId, null, null);

      await interaction.editReply({ embeds: [embed], components });
    }, 2000);
  }

  // Handle due date modal
  if (customId.startsWith('due_date_modal_')) {
    await interaction.deferReply({ flags: 64 });

    const parts = customId.split('_');
    const serviceId = parts[3];
    const guildId = parts[4];

    const newDueDate = interaction.fields.getTextInputValue('new_due_date');

    // Validate and format date
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(newDueDate)) {
      await interaction.editReply({ 
        content: 'Invalid date format. Please use YYYY-MM-DD format (e.g., 2024-12-31).'
      });
      return;
    }

    // Convert to ISO format
    const isoDate = `${newDueDate}T23:59:59.000000Z`;

    const config = await getConfig(guildId);

    if (!config) {
      await interaction.editReply({ 
        content: 'API configuration not found.'
      });
      return;
    }

    const result = await updateServiceDueDate(config.api_url, config.api_key, serviceId, isoDate);

    if (!result.success) {
      const errorEmbed = new EmbedBuilder()
        .setColor('#ff0000')
        .setTitle('Failed to Update Due Date')
        .setDescription(`Unable to update due date for service ID: \`${serviceId}\``)
        .addFields({ name: 'Error', value: result.error })
        .setTimestamp();

      await interaction.editReply({ embeds: [errorEmbed] });
      return;
    }

    const service = result.data;
    const successEmbed = new EmbedBuilder()
      .setColor('#00ff00')
      .setTitle('Due Date Updated Successfully')
      .setDescription(`> **${service.service_name}** due date has been updated.`)
      .addFields(
        { name: 'Service ID', value: `\`${service.id}\``, inline: true },
        { name: 'New Due Date', value: `<t:${Math.floor(new Date(service.due_date).getTime() / 1000)}:D>`, inline: true },
        { name: 'Status', value: `${getStatusEmoji(service.status)} ${service.status}`, inline: true },
        { name: 'Updated', value: `<t:${Math.floor(new Date(service.updated_at).getTime() / 1000)}:R>`, inline: true }
      )
      .setFooter({ text: 'Refreshing service list...' })
      .setTimestamp();

    await interaction.editReply({ embeds: [successEmbed] });

    // Refresh service list after 2 seconds
    setTimeout(async () => {
      const servicesResult = await getServices(config.api_url, config.api_key, 1, null, null);

      if (!servicesResult.success) return;

      const { current_page, last_page, total, data: services } = servicesResult.data;

      if (services.length === 0) return;

      const embed = createServicesEmbed(services, current_page, last_page, total, null, null);
      const components = createActionButtons(services, current_page, last_page, guildId, null, null);

      await interaction.editReply({ embeds: [embed], components });
    }, 2000);
  }
};

// API Functions
async function getServices(apiUrl, apiKey, page = 1, userEmail = null, status = null) {
  try {
    const params = new URLSearchParams({
      per_page: '10',
      page: page.toString()
    });

    if (userEmail) params.append('user_email', userEmail);
    if (status) params.append('status', status);

    const response = await fetch(`${apiUrl}/api/application/services?${params}`, {
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

async function getServiceById(apiUrl, apiKey, serviceId) {
  try {
    const response = await fetch(`${apiUrl}/api/application/services/${serviceId}`, {
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

async function suspendService(apiUrl, apiKey, serviceId) {
  try {
    const response = await fetch(`${apiUrl}/api/application/services/${serviceId}/suspend`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        error: errorData.message || `HTTP ${response.status}: ${response.statusText}`
      };
    }

    const data = await response.json();

    if (!data.success) {
      return {
        success: false,
        error: data.message || 'API returned success: false'
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

async function unsuspendService(apiUrl, apiKey, serviceId) {
  try {
    const response = await fetch(`${apiUrl}/api/application/services/${serviceId}/unsuspend`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        error: errorData.message || `HTTP ${response.status}: ${response.statusText}`
      };
    }

    const data = await response.json();

    if (!data.success) {
      return {
        success: false,
        error: data.message || 'API returned success: false'
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

async function terminateService(apiUrl, apiKey, serviceId) {
  try {
    const response = await fetch(`${apiUrl}/api/application/services/${serviceId}/terminate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        error: errorData.message || `HTTP ${response.status}: ${response.statusText}`
      };
    }

    const data = await response.json();

    if (!data.success) {
      return {
        success: false,
        error: data.message || 'API returned success: false'
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

async function activateService(apiUrl, apiKey, serviceId) {
  try {
    const response = await fetch(`${apiUrl}/api/application/services/${serviceId}/activate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        error: errorData.message || `HTTP ${response.status}: ${response.statusText}`
      };
    }

    const data = await response.json();

    if (!data.success) {
      return {
        success: false,
        error: data.message || 'API returned success: false'
      };
    }

    return {
      success: true,
      data: data.data,
      message: data.message
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

async function updateServicePrice(apiUrl, apiKey, serviceId, newPrice) {
  try {
    const response = await fetch(`${apiUrl}/api/application/services/${serviceId}/pricing`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ price: newPrice })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        error: errorData.message || `HTTP ${response.status}: ${response.statusText}`
      };
    }

    const data = await response.json();

    if (!data.success) {
      return {
        success: false,
        error: data.message || 'API returned success: false'
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

async function updateServiceDueDate(apiUrl, apiKey, serviceId, newDueDate) {
  try {
    const response = await fetch(`${apiUrl}/api/application/services/${serviceId}/due-date`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ due_date: newDueDate })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        error: errorData.message || `HTTP ${response.status}: ${response.statusText}`
      };
    }

    const data = await response.json();

    if (!data.success) {
      return {
        success: false,
        error: data.message || 'API returned success: false'
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

async function deleteService(apiUrl, apiKey, serviceId) {
  try {
    const response = await fetch(`${apiUrl}/api/application/services/${serviceId}/terminate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        error: errorData.message || `HTTP ${response.status}: ${response.statusText}`
      };
    }

    const data = await response.json();

    if (!data.success) {
      return {
        success: false,
        error: data.message || 'API returned success: false'
      };
    }

    return {
      success: true,
      message: data.message || 'Service deleted successfully'
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

// Helper function to get status emoji
function getStatusEmoji(status) {
  const emojis = {
    active: '✅',
    suspended: '⏸️',
    terminated: '🗑️',
    pending: '⏳'
  };
  return emojis[status] || '❓';
}