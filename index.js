const { 
  Client, 
  Intents, 
  Permissions, 
  MessageEmbed, 
  MessageActionRow, 
  MessageButton,
  Modal,
  TextInputComponent
} = require('discord.js');
const config = require('./config.json');

const client = new Client({
  intents: [
    Intents.FLAGS.GUILDS,
    Intents.FLAGS.GUILD_MESSAGES,
    Intents.FLAGS.GUILD_MEMBERS,
    Intents.FLAGS.GUILD_PRESENCES,
    Intents.FLAGS.DIRECT_MESSAGES
  ],
  partials: ['CHANNEL', 'MESSAGE']
});

const prefix = config.prefix;
const BATCH_SIZE = 10;
const BATCH_DELAY = 10000;
const MAX_MESSAGES_PER_MINUTE = 190;
let messageQueue = [];
let isProcessing = false;
let messagesSentLastMinute = 0;
let lastMessageTimestamp = Date.now();

setInterval(() => {
  messagesSentLastMinute = 0;
  lastMessageTimestamp = Date.now();
}, 60000);

client.once('ready', () => {
    console.log(`Skoda®Studio`);
    console.log(`https://discord.gg/TX8hXhvFu6`);  
    console.log(`Bot is ready! Logged in as ${client.user.tag}`);
});

client.on('messageCreate', async message => {
  if (message.author.bot || !message.content.startsWith(prefix)) return;

  const args = message.content.slice(prefix.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  if (command === 'bc') {
    if (!message.member.roles.cache.has(config.adminRole)) {
      return message.reply('عذراً، أنت لا تملك الرتبة المطلوبة لاستخدام هذا الأمر');
    }

    const broadcastEmbed = new MessageEmbed()
      .setTitle('🔊 نظام البرودكاست')
      .setDescription('اختر نوع البرودكاست الذي تريد إرساله')
      .setColor('#0099ff')
      .setImage(config.embedImage)
      .setTimestamp();

    const row = new MessageActionRow()
      .addComponents(
        new MessageButton()
          .setCustomId('broadcast-all')
          .setLabel('إرسال للجميع')
          .setStyle('PRIMARY')
          .setEmoji('📢'),
        new MessageButton()
          .setCustomId('broadcast-online')
          .setLabel('إرسال للمتصلين')
          .setStyle('SUCCESS')
          .setEmoji('🟢'),
        new MessageButton()
          .setCustomId('broadcast-offline')
          .setLabel('إرسال للغير متصلين')
          .setStyle('DANGER')
          .setEmoji('⭕'),
        new MessageButton()
          .setCustomId('broadcast-specific')
          .setLabel('إرسال لشخص معين')
          .setStyle('SECONDARY')
          .setEmoji('👤')
      );

    await message.channel.send({
      embeds: [broadcastEmbed],
      components: [row]
    });
  }
});

async function processMessageQueue() {
  if (isProcessing || messageQueue.length === 0) return;

  isProcessing = true;
  const currentTask = messageQueue[0];
  
  try {
    await sendMessagesToBatch(
      currentTask.members,
      currentTask.message,
      currentTask.interaction,
      currentTask.startIndex
    );
  } catch (error) {
    console.error('Error processing message queue:', error);
  }
}

async function sendMessagesToBatch(members, message, interaction, startIndex) {
  const endIndex = Math.min(startIndex + BATCH_SIZE, members.length);
  const currentBatch = members.slice(startIndex, endIndex);
  
  let sent = 0;
  let closed = 0;
  let rateLimited = false;

  for (const member of currentBatch) {
    if (member && member.user && !member.user.bot) {
      if (messagesSentLastMinute >= MAX_MESSAGES_PER_MINUTE) {
        rateLimited = true;
        break;
      }

      try {
        await member.send(`${member.user}\n${message}`);
        messagesSentLastMinute++;
        sent++;
      } catch (error) {
        if (error.code === 50007) {
          closed++;
        }
      }
    }
  }

  const progress = Math.floor((endIndex / members.length) * 100);
  const progressEmbed = new MessageEmbed()
    .setColor('#00ff00')
    .setTitle('🔄 تقدم البرودكاست')
    .setDescription(
      `تم الإرسال: ${sent}\nخاص مغلق: ${closed}\nالتقدم: ${progress}%` +
      (rateLimited ? '\n⚠️ تم إيقاف الإرسال مؤقتاً لتجنب تجاوز حد الرسائل' : '')
    );

  await interaction.editReply({ embeds: [progressEmbed], ephemeral: true });

  if (rateLimited) {
    const waitTime = 60000 - (Date.now() - lastMessageTimestamp);
    await new Promise(resolve => setTimeout(resolve, waitTime));
    messagesSentLastMinute = 0;
    lastMessageTimestamp = Date.now();
    
    await sendMessagesToBatch(members, message, interaction, startIndex);
  } else if (endIndex < members.length) {
    messageQueue[0].startIndex = endIndex;
    setTimeout(processMessageQueue, BATCH_DELAY);
  } else {
    const finalEmbed = new MessageEmbed()
      .setColor('#00ff00')
      .setTitle('✅ اكتمل البرودكاست')
      .setDescription(`تم إرسال الرسالة بنجاح!\n\nتم الإرسال: ${sent}\nخاص مغلق: ${closed}`);

    await interaction.editReply({ embeds: [finalEmbed], ephemeral: true });
    
    messageQueue.shift();
    isProcessing = false;
    processMessageQueue();
  }
}

client.on('interactionCreate', async interaction => {
  if (!interaction.isButton()) return;

  const { customId } = interaction;

  if (customId.startsWith('broadcast-')) {
    if (!interaction.member.roles.cache.has(config.adminRole)) {
      await interaction.reply({ 
        content: 'عذراً، أنت لا تملك الرتبة المطلوبة لاستخدام هذا الأمر',
        ephemeral: true 
      });
      return;
    }

    if (customId === 'broadcast-specific') {
      const userModal = new Modal()
        .setCustomId('user-modal')
        .setTitle('إدخال معرف المستخدم والرسالة');

      const userIdInput = new TextInputComponent()
        .setCustomId('userId')
        .setLabel('معرف المستخدم (ID)')
        .setStyle('SHORT')
        .setPlaceholder('أدخل معرف المستخدم هنا')
        .setRequired(true);

      const messageInput = new TextInputComponent()
        .setCustomId('message')
        .setLabel('الرسالة')
        .setStyle('PARAGRAPH')
        .setPlaceholder('اكتب رسالتك هنا')
        .setMaxLength(2000)
        .setRequired(true);

      const firstRow = new MessageActionRow().addComponents(userIdInput);
      const secondRow = new MessageActionRow().addComponents(messageInput);

      userModal.addComponents(firstRow, secondRow);
      await interaction.showModal(userModal);
    } else {
      const modal = new Modal()
        .setCustomId(`modal-${customId}`)
        .setTitle('كتابة رسالة البرودكاست');

      const messageInput = new TextInputComponent()
        .setCustomId('message')
        .setLabel('الرسالة')
        .setStyle('PARAGRAPH')
        .setPlaceholder('اكتب رسالتك هنا')
        .setMaxLength(2000)
        .setRequired(true);

      const row = new MessageActionRow().addComponents(messageInput);
      modal.addComponents(row);
      await interaction.showModal(modal);
    }
  }
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isModalSubmit()) return;

  try {
    const { customId } = interaction;
    const message = interaction.fields.getTextInputValue('message');

    await interaction.deferReply({ ephemeral: true });

    const members = await interaction.guild.members.fetch();
    let targetMembers = [];

    if (customId === 'modal-broadcast-all') {
      targetMembers = Array.from(members.values()).filter(member => !member.user.bot);
    } else if (customId === 'modal-broadcast-online') {
      targetMembers = Array.from(members.values()).filter(member => {
        const status = member.presence?.status;
        return !member.user.bot && (status === 'online' || status === 'dnd' || status === 'idle');
      });
    } else if (customId === 'modal-broadcast-offline') {
      targetMembers = Array.from(members.values()).filter(member => {
        const status = member.presence?.status;
        return !member.user.bot && (!status || status === 'offline');
      });
    } else if (customId === 'user-modal') {
      const userId = interaction.fields.getTextInputValue('userId');
      const targetMember = members.get(userId);
      
      if (!targetMember) {
        await interaction.editReply('لم يتم العثور على المستخدم المحدد.');
        return;
      }
      
      targetMembers = [targetMember];
    }

    if (targetMembers.length === 0) {
      await interaction.editReply('لا يوجد أعضاء مستهدفين للإرسال.');
      return;
    }

    messageQueue.push({
      members: targetMembers,
      message: message,
      interaction: interaction,
      startIndex: 0
    });

    if (messageQueue.length > 1) {
      await interaction.editReply('تم إضافة البرودكاست إلى قائمة الانتظار. سيتم إرساله بعد اكتمال البرودكاست الحالي.');
    } else {
      processMessageQueue();
    }

  } catch (error) {
    console.error('Error in modal submission:', error);
    await interaction.editReply({ 
      content: 'حدث خطأ أثناء معالجة طلبك. الرجاء المحاولة مرة أخرى.', 
      ephemeral: true 
    });
  }
});

client.login(config.TOKEN);
