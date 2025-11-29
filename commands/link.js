const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, PermissionFlagsBits } = require('discord.js');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');


const dataDir = path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}


const db = new sqlite3.Database(path.join(dataDir, 'config.db'), (err) => {
  if (err) {
    console.error('Error opening database:', err);
  } else {
    
    db.run(`CREATE TABLE IF NOT EXISTS spartan_config (
      guild_id TEXT PRIMARY KEY,
      api_key TEXT NOT NULL,
      api_url TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
  }
});

module.exports = {
  name: 'link',
  data: new SlashCommandBuilder()
    .setName('link')
    .setDescription('Configure Spartan API credentials'),

  async execute(interaction) {
    const guildId = interaction.guildId;
    const discordId = interaction.user.id;

    
    const existingConfig = await getConfig(guildId);

    let isAdmin = false;

    if (existingConfig) {
      
      const { isUserAdmin } = require('./Users/SyncDiscord.js');
      isAdmin = await isUserAdmin(guildId, discordId);
    } else {
      
      const member = await interaction.guild.members.fetch(discordId);
      isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);
    }

    if (!isAdmin) {
      const errorEmbed = new EmbedBuilder()
        .setColor('#ff0000')
        .setTitle('🔒 Access Denied')
        .setDescription('You need admin privileges to use this command.')
        .addFields({
          name: '💡 How to gain access',
          value: existingConfig
            ? 'Run `/syncdiscord` to sync your account. Only users with **Admin** or **Super Admin** roles in the Spartan panel can access this command.'
            : 'You must have the **Administrator** permission in this Discord server to configure Spartan API.'
        })
        .setTimestamp();

      await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
      return;
    }

    
    const modal = new ModalBuilder()
      .setCustomId('spartan_config_modal')
      .setTitle('Spartan API Configuration');

    const apiKeyInput = new TextInputBuilder()
      .setCustomId('api_key_input')
      .setLabel('Spartan API Key')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Enter your API key')
      .setRequired(true);

    const apiUrlInput = new TextInputBuilder()
      .setCustomId('api_url_input')
      .setLabel('Spartan API URL')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('https://billing.example.com')
      .setValue('https://billing.example.com')
      .setRequired(true);

    const firstRow = new ActionRowBuilder().addComponents(apiKeyInput);
    const secondRow = new ActionRowBuilder().addComponents(apiUrlInput);

    modal.addComponents(firstRow, secondRow);

    await interaction.showModal(modal);
  }
};


module.exports.handleModalSubmit = async (interaction) => {
  if (interaction.customId !== 'spartan_config_modal') return;

  const apiKey = interaction.fields.getTextInputValue('api_key_input');
  const apiUrl = interaction.fields.getTextInputValue('api_url_input');
  const guildId = interaction.guildId;

  
  const embed = new EmbedBuilder()
    .setColor('#0099ff')
    .setTitle('⚙️ Spartan API Configuration')
    .setDescription('Your API credentials have been received.')
    .addFields(
      { name: '🔑 API Key', value: `||${apiKey.substring(0, 8)}...||`, inline: true },
      { name: '🌐 API URL', value: apiUrl, inline: true },
      { name: '📊 Status', value: '⏳ Pending Test', inline: false }
    )
    .setTimestamp()
    .setFooter({ text: 'Click "Test Connection" to verify credentials' });

  
  const testButton = new ButtonBuilder()
    .setCustomId(`test_connection_${guildId}_${Date.now()}`)
    .setLabel('🔌 Test Connection')
    .setStyle(ButtonStyle.Primary);

  const row = new ActionRowBuilder().addComponents(testButton);

  
  await saveConfig(guildId, apiKey, apiUrl);

  
  
  await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
};


module.exports.handleTestConnection = async (interaction) => {
  if (!interaction.customId.startsWith('test_connection_')) return;

  await interaction.deferUpdate();

  const guildId = interaction.guildId;

  
  const config = await getConfig(guildId);

  if (!config) {
    const errorEmbed = new EmbedBuilder()
      .setColor('#ff0000')
      .setTitle('❌ Configuration Not Found')
      .setDescription('Please run `/link` again to configure your API credentials.')
      .setTimestamp();

    await interaction.editReply({ embeds: [errorEmbed], components: [] });
    return;
  }

  
  const testResult = await testApiConnection(config.api_url, config.api_key);

  if (testResult.success) {
    const successEmbed = new EmbedBuilder()
      .setColor('#00ff00')
      .setTitle('✅ Connection Successful')
      .setDescription('Your Spartan API credentials have been verified and saved.')
      .addFields(
        { name: '🔑 API Key', value: `||${config.api_key.substring(0, 8)}...||`, inline: true },
        { name: '🌐 API URL', value: config.api_url, inline: true },
        { name: '📊 Status', value: '✅ Connected', inline: false },
        { name: '👥 Users Found', value: testResult.userCount.toString(), inline: true },
        { name: '⏱️ Response Time', value: `${testResult.responseTime}ms`, inline: true }
      )
      .setTimestamp()
      .setFooter({ text: 'Configuration saved successfully' });

    await interaction.editReply({ embeds: [successEmbed], components: [] });
  } else {
    const errorEmbed = new EmbedBuilder()
      .setColor('#ff0000')
      .setTitle('❌ Connection Failed')
      .setDescription('Unable to connect to the Spartan API. Please check your credentials.')
      .addFields(
        { name: '🔑 API Key', value: `||${config.api_key.substring(0, 8)}...||`, inline: true },
        { name: '🌐 API URL', value: config.api_url, inline: true },
        { name: '📊 Status', value: '❌ Failed', inline: false },
        { name: '⚠️ Error', value: testResult.error, inline: false }
      )
      .setTimestamp()
      .setFooter({ text: 'Please verify your credentials and try again' });

    const retryButton = new ButtonBuilder()
      .setCustomId(`test_connection_${guildId}_${Date.now()}`)
      .setLabel('🔄 Retry Connection')
      .setStyle(ButtonStyle.Primary);

    const row = new ActionRowBuilder().addComponents(retryButton);

    await interaction.editReply({ embeds: [errorEmbed], components: [row] });
  }
};


function saveConfig(guildId, apiKey, apiUrl) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO spartan_config (guild_id, api_key, api_url, updated_at) 
       VALUES (?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(guild_id) DO UPDATE SET 
       api_key = excluded.api_key,
       api_url = excluded.api_url,
       updated_at = CURRENT_TIMESTAMP`,
      [guildId, apiKey, apiUrl],
      (err) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });
}

function getConfig(guildId) {
  return new Promise((resolve, reject) => {
    db.get(
      'SELECT * FROM spartan_config WHERE guild_id = ?',
      [guildId],
      (err, row) => {
        if (err) reject(err);
        else resolve(row);
      }
    );
  });
}


async function testApiConnection(apiUrl, apiKey) {
  const startTime = Date.now();

  try {
    const response = await fetch(`${apiUrl}/api/application/users?per_page=1`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json'
      }
    });

    const responseTime = Date.now() - startTime;

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
        responseTime
      };
    }

    const data = await response.json();

    if (data.success) {
      return {
        success: true,
        userCount: data.data.total || 0,
        responseTime
      };
    } else {
      return {
        success: false,
        error: 'API returned success: false',
        responseTime
      };
    }
  } catch (error) {
    return {
      success: false,
      error: error.message,
      responseTime: Date.now() - startTime
    };
  }
}


module.exports.getConfig = getConfig;