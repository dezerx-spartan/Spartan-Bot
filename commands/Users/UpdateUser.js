const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { getConfig } = require('../link.js');

module.exports = {
  name: 'updateuser',
  data: new SlashCommandBuilder()
    .setName('updateuser')
    .setDescription('Update a user in Spartan API')
    .addStringOption(option =>
      option.setName('identifier')
        .setDescription('User ID or Email')
        .setRequired(true)
    ),
  
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const guildId = interaction.guildId;
    const discordId = interaction.user.id;
    const identifier = interaction.options.getString('identifier');

    
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

    
    const userResult = await findUser(config.api_url, config.api_key, identifier);

    if (!userResult.success) {
      const errorEmbed = new EmbedBuilder()
        .setColor('#ff0000')
        .setTitle('❌ User Not Found')
        .setDescription(`Unable to find user with identifier: \`${identifier}\``)
        .addFields({ name: '⚠️ Error', value: userResult.error })
        .setTimestamp();

      await interaction.editReply({ embeds: [errorEmbed] });
      return;
    }

    const user = userResult.user;

    
    const embed = new EmbedBuilder()
      .setColor('#5865F2')
      .setTitle('👤 User Found')
      .setDescription(`Click the button below to update **${user.name}**'s information.`)
      .addFields(
        { name: '🆔 User ID', value: `\`${user.id}\``, inline: true },
        { name: '👤 Name', value: user.name, inline: true },
        { name: '📧 Email', value: user.email, inline: true },
        { name: '🛡️ Role', value: user.admin_role?.display_name || 'User', inline: true },
        { name: '✅ Verified', value: user.email_verified_at ? 'Yes' : 'No', inline: true },
        { name: '📅 Created', value: `<t:${Math.floor(new Date(user.created_at).getTime() / 1000)}:R>`, inline: true }
      )
      .setTimestamp()
      .setFooter({ text: 'Click the button to edit this user' });

    
    const editButton = new ButtonBuilder()
      .setCustomId(`edit_user_${user.id}_${guildId}`)
      .setLabel('✏️ Edit User')
      .setStyle(ButtonStyle.Primary);

    const row = new ActionRowBuilder().addComponents(editButton);

    await interaction.editReply({ embeds: [embed], components: [row] });
  }
};


module.exports.handleEditButton = async (interaction) => {
  if (!interaction.customId.startsWith('edit_user_')) return;

  const [, , userId, guildId] = interaction.customId.split('_');

  
  const config = await getConfig(guildId);

  if (!config) {
    await interaction.reply({ 
      content: '❌ API configuration not found. Please run `/link` again.', 
      ephemeral: true 
    });
    return;
  }

  
  const userResult = await getUserById(config.api_url, config.api_key, userId);

  if (!userResult.success) {
    await interaction.reply({ 
      content: `❌ Failed to fetch user data: ${userResult.error}`, 
      ephemeral: true 
    });
    return;
  }

  const user = userResult.user;

  
  const modal = new ModalBuilder()
    .setCustomId(`update_user_modal_${userId}_${guildId}`)
    .setTitle(`Update User: ${user.name}`);

  const nameInput = new TextInputBuilder()
    .setCustomId('name_input')
    .setLabel('Name')
    .setStyle(TextInputStyle.Short)
    .setValue(user.name)
    .setRequired(false)
    .setMaxLength(255);

  const emailInput = new TextInputBuilder()
    .setCustomId('email_input')
    .setLabel('Email')
    .setStyle(TextInputStyle.Short)
    .setValue(user.email)
    .setRequired(false)
    .setMaxLength(255);

  const roleInput = new TextInputBuilder()
    .setCustomId('role_input')
    .setLabel('Role')
    .setStyle(TextInputStyle.Short)
    .setValue(user.admin_role?.name || 'user')
    .setRequired(false);

  const passwordInput = new TextInputBuilder()
    .setCustomId('password_input')
    .setLabel('New Password (leave empty to keep current)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('Enter new password (min 8 characters)')
    .setRequired(false)
    .setMinLength(8);

  const notesInput = new TextInputBuilder()
    .setCustomId('notes_input')
    .setLabel('Update Notes (optional, not sent to API)')
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder('Why are you updating this user?')
    .setRequired(false);

  const row1 = new ActionRowBuilder().addComponents(nameInput);
  const row2 = new ActionRowBuilder().addComponents(emailInput);
  const row3 = new ActionRowBuilder().addComponents(roleInput);
  const row4 = new ActionRowBuilder().addComponents(passwordInput);
  const row5 = new ActionRowBuilder().addComponents(notesInput);

  modal.addComponents(row1, row2, row3, row4, row5);

  await interaction.showModal(modal);
};


module.exports.handleModalSubmit = async (interaction) => {
  if (!interaction.customId.startsWith('update_user_modal_')) return;

  await interaction.deferReply({ ephemeral: true });

  const [, , , userId, guildId] = interaction.customId.split('_');

  const name = interaction.fields.getTextInputValue('name_input').trim();
  const email = interaction.fields.getTextInputValue('email_input').trim();
  const role = interaction.fields.getTextInputValue('role_input').trim();
  const password = interaction.fields.getTextInputValue('password_input').trim();
  const notes = interaction.fields.getTextInputValue('notes_input').trim();

  
  const config = await getConfig(guildId);

  if (!config) {
    const errorEmbed = new EmbedBuilder()
      .setColor('#ff0000')
      .setTitle('❌ Configuration Not Found')
      .setDescription('API configuration not found. Please run `/link` again.')
      .setTimestamp();

    await interaction.editReply({ embeds: [errorEmbed] });
    return;
  }

  
  const updateData = {};
  if (name) updateData.name = name;
  if (email) updateData.email = email;
  if (role) updateData.role = role;
  if (password) updateData.password = password;

  
  const result = await updateUser(config.api_url, config.api_key, userId, updateData);

  if (!result.success) {
    const errorEmbed = new EmbedBuilder()
      .setColor('#ff0000')
      .setTitle('❌ Update Failed')
      .setDescription('Failed to update user information.')
      .addFields({ name: '⚠️ Error', value: result.error })
      .setTimestamp();

    await interaction.editReply({ embeds: [errorEmbed] });
    return;
  }

  const updatedUser = result.data;

  
  const successEmbed = new EmbedBuilder()
    .setColor('#00ff00')
    .setTitle('✅ User Updated Successfully')
    .setDescription(`**${updatedUser.name}** has been updated.`)
    .addFields(
      { name: '🆔 User ID', value: `\`${updatedUser.id}\``, inline: true },
      { name: '👤 Name', value: updatedUser.name, inline: true },
      { name: '📧 Email', value: updatedUser.email, inline: true },
      { name: '🛡️ Role', value: updatedUser.role, inline: true },
      { name: '📅 Updated', value: `<t:${Math.floor(new Date(updatedUser.updated_at).getTime() / 1000)}:R>`, inline: true }
    )
    .setTimestamp()
    .setFooter({ text: 'User information updated successfully' });

  if (notes) {
    successEmbed.addFields({ name: '📝 Update Notes', value: notes });
  }

  if (password) {
    successEmbed.addFields({ name: '🔒 Password', value: '✅ Password was updated' });
  }

  await interaction.editReply({ embeds: [successEmbed] });
};


async function findUser(apiUrl, apiKey, identifier) {
  try {
    
    if (!isNaN(identifier)) {
      return await getUserById(apiUrl, apiKey, identifier);
    }

    
    const params = new URLSearchParams({
      search: identifier,
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

    if (!data.success || !data.data.data || data.data.data.length === 0) {
      return {
        success: false,
        error: 'No user found with that email'
      };
    }

    
    const user = data.data.data.find(u => u.email.toLowerCase() === identifier.toLowerCase());

    if (!user) {
      return {
        success: false,
        error: 'No exact email match found'
      };
    }

    return {
      success: true,
      user
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}


async function getUserById(apiUrl, apiKey, userId) {
  try {
    const response = await fetch(`${apiUrl}/api/application/users/${userId}`, {
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
      user: data.data
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}


async function updateUser(apiUrl, apiKey, userId, updateData) {
  try {
    const response = await fetch(`${apiUrl}/api/application/users/${userId}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(updateData)
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