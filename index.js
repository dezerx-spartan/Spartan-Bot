const { Client, GatewayIntentBits, Collection } = require('discord.js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.commands = new Collection();

function getCommandFiles(dir) {
  let commandFiles = [];
  const files = fs.readdirSync(dir);

  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.lstatSync(fullPath).isDirectory()) {
      commandFiles = commandFiles.concat(getCommandFiles(fullPath));
    } else if (file.endsWith('.js')) {
      commandFiles.push(fullPath);
    }
  }

  return commandFiles;
}

const commandFiles = getCommandFiles(path.join(__dirname, 'commands'));

for (const file of commandFiles) {
  const command = require(file);
  client.commands.set(command.name, command);
}

client.on('clientReady', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

// Handle slash commands
client.on('interactionCreate', async interaction => {
  // Handle slash commands
  if (interaction.isChatInputCommand()) {
    const command = client.commands.get(interaction.commandName);

    if (!command) return;

    try {
      await command.execute(interaction);
    } catch (error) {
      console.error(error);
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: 'There was an error executing this command!', ephemeral: true });
      } else {
        await interaction.reply({ content: 'There was an error executing this command!', ephemeral: true });
      }
    }
  }

  // Handle modal submissions
  if (interaction.isModalSubmit()) {
    if (interaction.customId === 'spartan_config_modal') {
      const linkCommand = client.commands.get('link');
      if (linkCommand && linkCommand.handleModalSubmit) {
        try {
          await linkCommand.handleModalSubmit(interaction);
        } catch (error) {
          console.error(error);
          await interaction.reply({ content: 'There was an error processing your configuration!', ephemeral: true });
        }
      }
    }
    
    if (interaction.customId.startsWith('update_user_modal_')) {
      const updateUserCommand = client.commands.get('updateuser');
      if (updateUserCommand && updateUserCommand.handleModalSubmit) {
        try {
          await updateUserCommand.handleModalSubmit(interaction);
        } catch (error) {
          console.error(error);
          await interaction.reply({ content: 'There was an error updating the user!', ephemeral: true });
        }
      }
    }

    // Handle service price and due date modals
    if (interaction.customId.startsWith('price_modal_') || interaction.customId.startsWith('due_date_modal_')) {
      const manageServicesCommand = client.commands.get('manageservices');
      if (manageServicesCommand && manageServicesCommand.handleModalSubmit) {
        try {
          await manageServicesCommand.handleModalSubmit(interaction);
        } catch (error) {
          console.error(error);
          await interaction.reply({ content: 'There was an error processing your request!', ephemeral: true });
        }
      }
    }
  }

  // Handle select menu interactions
  if (interaction.isStringSelectMenu()) {
    if (interaction.customId.startsWith('service_action_')) {
      const manageServicesCommand = client.commands.get('manageservices');
      if (manageServicesCommand && manageServicesCommand.handleServiceAction) {
        try {
          await manageServicesCommand.handleServiceAction(interaction);
        } catch (error) {
          console.error(error);
          await interaction.reply({ content: 'There was an error processing the service action!', ephemeral: true });
        }
      }
    }
  }

  // Handle button interactions
  if (interaction.isButton()) {
    // Test connection button
    if (interaction.customId.startsWith('test_connection_')) {
      const linkCommand = client.commands.get('link');
      if (linkCommand && linkCommand.handleTestConnection) {
        try {
          await linkCommand.handleTestConnection(interaction);
        } catch (error) {
          console.error(error);
          await interaction.reply({ content: 'There was an error testing the connection!', ephemeral: true });
        }
      }
    }

    // Users pagination buttons
    if (interaction.customId.startsWith('users_')) {
      const usersCommand = client.commands.get('users');
      if (usersCommand && usersCommand.handlePagination) {
        try {
          await usersCommand.handlePagination(interaction);
        } catch (error) {
          console.error(error);
          await interaction.reply({ content: 'There was an error loading the page!', ephemeral: true });
        }
      }
    }

    // Services pagination buttons
    if (interaction.customId.startsWith('services_')) {
      const manageServicesCommand = client.commands.get('manageservices');
      if (manageServicesCommand && manageServicesCommand.handlePagination) {
        try {
          await manageServicesCommand.handlePagination(interaction);
        } catch (error) {
          console.error(error);
          await interaction.reply({ content: 'There was an error loading the page!', ephemeral: true });
        }
      }
    }

    // Edit user button
    if (interaction.customId.startsWith('edit_user_')) {
      const updateUserCommand = client.commands.get('updateuser');
      if (updateUserCommand && updateUserCommand.handleEditButton) {
        try {
          await updateUserCommand.handleEditButton(interaction);
        } catch (error) {
          console.error(error);
          await interaction.reply({ content: 'There was an error opening the edit form!', ephemeral: true });
        }
      }
    }

    // Service action buttons (suspend, unsuspend, terminate, activate, delete, change_price, change_due_date)
    if (interaction.customId.startsWith('suspend_service_') ||
        interaction.customId.startsWith('unsuspend_service_') ||
        interaction.customId.startsWith('terminate_service_') ||
        interaction.customId.startsWith('activate_service_') ||
        interaction.customId.startsWith('delete_service_') ||
        interaction.customId.startsWith('change_price_') ||
        interaction.customId.startsWith('change_due_date_') ||
        interaction.customId === 'cancel_service_action') {
      const manageServicesCommand = client.commands.get('manageservices');
      if (manageServicesCommand && manageServicesCommand.handleServiceActionButton) {
        try {
          await manageServicesCommand.handleServiceActionButton(interaction);
        } catch (error) {
          console.error(error);
          await interaction.reply({ content: 'There was an error processing the service action!', ephemeral: true });
        }
      }
    }
  }
});

client.login(process.env.TOKEN);