const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

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

const commands = [];
for (const file of commandFiles) {
  const command = require(file);
  
  
  
  if (command.data) {
    commands.push(command.data.toJSON());
    console.log(`✅ Loaded command: ${command.name}`);
  } else {
    console.log(`⚠️  Skipped: ${path.basename(file)} (no slash command data)`);
  }
}

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

(async () => {
  try {
    console.log(`\nStarted refreshing ${commands.length} application (/) commands.`);

    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commands },
    );

    console.log('Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error(error);
  }
})();