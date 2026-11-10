import { getIO } from "../../libs/socket";
import CompaniesSettings from "../../models/CompaniesSettings";
import Contact from "../../models/Contact";
import { Op } from "sequelize";
import ContactCustomField from "../../models/ContactCustomField";
import ContactListItem from "../../models/ContactListItem";
import Ticket from "../../models/Ticket";
import Message from "../../models/Message";
import fs from "fs";
import path, { join } from "path";
import logger from "../../utils/logger";
import { isNil, isEmpty } from "lodash";
import Whatsapp from "../../models/Whatsapp";
import * as Sentry from "@sentry/node";
import moment from "moment";
import getFrontendUrl from "../../helpers/FrontendUrl";

const axios = require('axios');

const LID_FIELD = "whatsapp_lid";

interface ExtraInfo extends ContactCustomField {
  name: string;
  value: string;
}

interface Request {
  name: string;
  number: string;
  isGroup: boolean;
  email?: string;
  profilePicUrl?: string;
  companyId: number;
  channel?: string;
  extraInfo?: ExtraInfo[];
  remoteJid?: string;
  whatsappId?: number;
  wbot?: any;
  lid?: string;
}

// Função para validar se o nome é válido
const isValidName = (name: string): boolean => {
  // Remove espaços em branco
  const cleanName = name ? name.trim() : "";

  // Verifica se o nome não é apenas números ou vazio
  if (isEmpty(cleanName) || /^\d+$/.test(cleanName)) {
    return false;
  }

  // Verifica se o nome tem pelo menos 2 caracteres após remover espaços
  return cleanName.length >= 2;
};

// Aqui eu gero todas as variações possíveis do telefone brasileiro (com e sem DDI 55,
// com e sem o nono dígito, além do formato @s.whatsapp.net) para nunca duplicar contato
export const buildContactCandidates = (
  rawNumber?: string,
  remoteJid?: string,
  lid?: string
): string[] => {
  const candidates = new Set<string>();
  const numericSeeds = new Set<string>();

  const addVariantsForDigits = (digits: string) => {
    if (!digits) return;
    candidates.add(digits);
    candidates.add(`${digits}@s.whatsapp.net`);

    // 13 dígitos com DDI 55 + DDD (2) + 9 + 8 dígitos
    if (digits.startsWith("55") && digits.length === 13 && digits[4] === "9") {
      const withoutNine = digits.slice(0, 4) + digits.slice(5);
      const noDdiWithNine = digits.slice(2);
      const noDdiWithoutNine = digits.slice(2, 4) + digits.slice(5);
      [withoutNine, noDdiWithNine, noDdiWithoutNine].forEach(v => {
        candidates.add(v);
        candidates.add(`${v}@s.whatsapp.net`);
      });
    }
    // 12 dígitos com DDI 55 + DDD (2) + 8 dígitos
    else if (digits.startsWith("55") && digits.length === 12) {
      const withNine = digits.slice(0, 4) + "9" + digits.slice(4);
      const noDdiWithoutNine = digits.slice(2);
      const noDdiWithNine = digits.slice(2, 4) + "9" + digits.slice(4);
      [withNine, noDdiWithoutNine, noDdiWithNine].forEach(v => {
        candidates.add(v);
        candidates.add(`${v}@s.whatsapp.net`);
      });
    }
    // 11 dígitos sem DDI: DDD (2) + 9 + 8 dígitos
    else if (!digits.startsWith("55") && digits.length === 11 && digits[2] === "9") {
      const withDdiWithNine = "55" + digits;
      const withDdiWithoutNine = "55" + digits.slice(0, 2) + digits.slice(3);
      const noDdiWithoutNine = digits.slice(0, 2) + digits.slice(3);
      [withDdiWithNine, withDdiWithoutNine, noDdiWithoutNine].forEach(v => {
        candidates.add(v);
        candidates.add(`${v}@s.whatsapp.net`);
      });
    }
    // 10 dígitos sem DDI: DDD (2) + 8 dígitos
    else if (!digits.startsWith("55") && digits.length === 10) {
      const withDdiWithoutNine = "55" + digits;
      const withDdiWithNine = "55" + digits.slice(0, 2) + "9" + digits.slice(2);
      const noDdiWithNine = digits.slice(0, 2) + "9" + digits.slice(2);
      [withDdiWithoutNine, withDdiWithNine, noDdiWithNine].forEach(v => {
        candidates.add(v);
        candidates.add(`${v}@s.whatsapp.net`);
      });
    }
  };

  if (rawNumber) {
    candidates.add(rawNumber);
    const digits = rawNumber.replace(/\D/g, "");
    if (digits) numericSeeds.add(digits);
  }

  if (remoteJid) {
    candidates.add(remoteJid);
    const base = remoteJid.replace(/@.*/, "");
    if (base) candidates.add(base);
    if (!remoteJid.endsWith("@lid") && !remoteJid.endsWith("@g.us")) {
      const digits = base.replace(/\D/g, "");
      if (digits) numericSeeds.add(digits);
    }
  }

  if (lid) {
    candidates.add(lid);
    const lidDigits = lid.replace(/@.*/, "").replace(/\D/g, "");
    if (lidDigits) {
      candidates.add(lidDigits);
      candidates.add(`${lidDigits}@lid`);
    }
  }

  numericSeeds.forEach(addVariantsForDigits);

  return Array.from(candidates).filter(Boolean);
};

// Busca o contato existente por número, remoteJid, variações de 9º dígito ou LID,
// e se já existirem contatos duplicados para a mesma pessoa na empresa, unifica as conversas
// no contato principal sem apagar nenhum registro do banco
export const findExistingContact = async ({
  companyId,
  name,
  number,
  remoteJid,
  lid,
  isGroup = false
}: {
  companyId: number;
  name?: string;
  number?: string;
  remoteJid?: string;
  lid?: string;
  isGroup?: boolean;
}): Promise<Contact | null> => {
  if (isGroup) {
    const cleanGroup = (number || remoteJid || "").replace("@g.us", "");
    const groupJid = `${cleanGroup}@g.us`;
    return Contact.findOne({
      where: {
        companyId,
        [Op.or]: [
          { number: cleanGroup },
          { number: groupJid },
          { remoteJid: groupJid }
        ]
      }
    });
  }

  const effectiveLid =
    lid || (remoteJid && remoteJid.endsWith("@lid") ? remoteJid : undefined);

  const matchedContacts: Contact[] = [];

  if (effectiveLid) {
    const lidDigits = effectiveLid.replace(/@.*/, "").replace(/\D/g, "");
    const lidValues = Array.from(
      new Set([effectiveLid, lidDigits, lidDigits ? `${lidDigits}@lid` : ""].filter(Boolean))
    );
    const customFields = await ContactCustomField.findAll({
      where: { name: LID_FIELD, value: { [Op.in]: lidValues } },
      include: [{ model: Contact, where: { companyId }, required: true }]
    });
    customFields.forEach(cf => {
      if (cf.contact) matchedContacts.push(cf.contact);
    });
  }

  const candidates = buildContactCandidates(number, remoteJid, effectiveLid);
  if (candidates.length > 0) {
    const found = await Contact.findAll({
      where: {
        companyId,
        isGroup: false,
        [Op.or]: [
          { number: { [Op.in]: candidates } },
          { remoteJid: { [Op.in]: candidates } }
        ]
      },
      order: [["id", "ASC"]]
    });
    found.forEach(c => {
      if (!matchedContacts.some(existing => existing.id === c.id)) {
        matchedContacts.push(c);
      }
    });
  }

  // Se o nome é válido (não numérico), busca também contatos da mesma empresa com o mesmo nome
  // para unificar casos em que um contato foi salvo com @lid e outro com o telefone real
  if (name && isValidName(name)) {
    const byName = await Contact.findAll({
      where: {
        companyId,
        isGroup: false,
        name: name.trim()
      },
      order: [["id", "ASC"]]
    });
    if (byName.length > 1 || (byName.length === 1 && (effectiveLid || byName[0].remoteJid?.endsWith("@lid") || (byName[0].number && byName[0].number.length > 13)))) {
      byName.forEach(c => {
        if (!matchedContacts.some(existing => existing.id === c.id)) {
          matchedContacts.push(c);
        }
      });
    }
  }

  if (matchedContacts.length === 0) {
    return null;
  }

  // Escolhe o melhor contato principal: prefere aquele que tem telefone real (não @lid) e nome válido
  const isRealPhoneContact = (c: Contact) =>
    c.remoteJid?.endsWith("@s.whatsapp.net") ||
    (c.number && c.number.length >= 10 && c.number.length <= 13);

  matchedContacts.sort((a, b) => {
    const aReal = isRealPhoneContact(a) ? 1 : 0;
    const bReal = isRealPhoneContact(b) ? 1 : 0;
    if (aReal !== bReal) return bReal - aReal;

    const aNamed = isValidName(a.name) ? 1 : 0;
    const bNamed = isValidName(b.name) ? 1 : 0;
    if (aNamed !== bNamed) return bNamed - aNamed;

    return a.id - b.id;
  });

  const primary = matchedContacts[0];
  const secondaryIds = matchedContacts.slice(1).map(c => c.id);

  // Se havia mais de um cadastro para o mesmo contato, transfere todos os tickets e mensagens
  // para o contato principal para que nunca fiquem conversas separadas
  if (secondaryIds.length > 0) {
    try {
      await Ticket.update(
        { contactId: primary.id },
        { where: { companyId, contactId: { [Op.in]: secondaryIds } } }
      );
      await Message.update(
        { contactId: primary.id },
        { where: { companyId, contactId: { [Op.in]: secondaryIds } } }
      );
    } catch (err) {
      logger.warn(`Erro ao unificar tickets de contatos duplicados (${secondaryIds.join(",")} -> ${primary.id}): ${err}`);
    }
  }

  return primary;
};

const downloadProfileImage = async ({
  profilePicUrl,
  companyId,
  contact
}) => {
  const publicFolder = path.resolve(__dirname, "..", "..", "..", "public");
  let filename;

  const folder = path.resolve(publicFolder, `company${companyId}`, "contacts");

  if (!fs.existsSync(folder)) {
    fs.mkdirSync(folder, { recursive: true });
    fs.chmodSync(folder, 0o777);
  }

  try {
    const response = await axios.get(profilePicUrl, {
      responseType: 'arraybuffer'
    });

    filename = `${new Date().getTime()}.jpeg`;
    fs.writeFileSync(join(folder, filename), response.data);

  } catch (error) {
    console.error(error)
  }

  return filename
}

const CreateOrUpdateContactService = async ({
  name,
  number: rawNumber,
  profilePicUrl,
  isGroup,
  email = "",
  channel = "whatsapp",
  companyId,
  extraInfo = [],
  remoteJid = "",
  whatsappId,
  wbot,
  lid
}: Request): Promise<Contact> => {
  try {
    let createContact = false;
    const publicFolder = path.resolve(__dirname, "..", "..", "..", "public");
    const number = isGroup ? rawNumber : rawNumber.replace(/[^0-9]/g, "");
    const io = getIO();
    let contact: Contact | null;

    // Busca o nome na lista de contatos se o nome atual for inválido
    const candidatesForList = buildContactCandidates(rawNumber, remoteJid);
    let contactListItem = await ContactListItem.findOne({
      where: {
        number: candidatesForList.length > 0 ? { [Op.in]: candidatesForList } : rawNumber,
        companyId: companyId
      }
    });

    // Determina o nome a ser usado inicialmente
    let contactName = name;
    if (!isValidName(name)) {
      contactName = contactListItem?.name;
      if (!contactName && wbot && ['whatsapp'].includes(channel)) {
        try {
          // Baileys 6 removeu `getContactById`. O nome vem do store de
          // contatos do socket; `onWhatsApp` é o fallback para forçar a
          // busca no servidor quando o contato ainda não está em cache.
          let wbotContact: any =
            wbot.store?.contacts?.[remoteJid] || wbot.contacts?.[remoteJid];

          if (!wbotContact && typeof wbot.onWhatsApp === "function" && !remoteJid.endsWith("@lid")) {
            const [res] = await wbot.onWhatsApp(remoteJid);
            if (res?.exists) wbotContact = res;
          }

          contactName = wbotContact?.name || wbotContact?.pushname || wbotContact?.notify;
        } catch (e) {
          logger.error(
            `Erro ao buscar nome via wbot (${remoteJid}): ${
              (e as Error)?.message || JSON.stringify(e)
            }`
          );
        }
      }
      contactName = contactName || `${number}`;
    }

    // Busca unificada por número, remoteJid, variações BR (com/sem 9º dígito), nome e LID
    contact = await findExistingContact({
      companyId,
      name: contactName,
      number,
      remoteJid,
      lid,
      isGroup
    });

    let updateImage = (!contact || contact?.profilePicUrl !== profilePicUrl && profilePicUrl !== "") && wbot || false;

    if (contact) {
      // Não sobrescreve um remoteJid de telefone válido (@s.whatsapp.net) por um @lid
      if (remoteJid && (!remoteJid.endsWith("@lid") || !contact.remoteJid?.endsWith("@s.whatsapp.net"))) {
        contact.remoteJid = remoteJid;
      }
      // Se o contato antigo estava salvo com número de LID e agora temos o telefone real, atualiza para o telefone real
      if (!isGroup && number && !remoteJid.endsWith("@lid") && contact.number !== number && contact.number.length > 13) {
        const collision = await Contact.findOne({
          where: { companyId, number, id: { [Op.ne]: contact.id } }
        });
        if (!collision) {
          contact.number = number;
        }
      }

      contact.profilePicUrl = profilePicUrl || contact.profilePicUrl || null;
      contact.isGroup = isGroup;

      // Atualiza o nome apenas se o nome atual for inválido
      if (!isValidName(contact.name) && isValidName(contactName)) {
        contact.name = contactName;
      }

      if (isNil(contact.whatsappId) && whatsappId) {
        const whatsapp = await Whatsapp.findOne({
          where: { id: whatsappId, companyId }
        });
        if (whatsapp) {
          contact.whatsappId = whatsappId;
        }
      }

      const folder = path.resolve(publicFolder, `company${companyId}`, "contacts");
      let fileName, oldPath = "";
      if (contact.urlPicture) {
        oldPath = path.resolve(contact.urlPicture.replace(/\\/g, '/'));
        fileName = path.join(folder, oldPath.split('\\').pop());
      }

      if (!fs.existsSync(fileName) || contact.profilePicUrl === "") {
        if (wbot && ['whatsapp'].includes(channel)) {
          try {
            const jidForPic = contact.remoteJid || remoteJid;
            profilePicUrl = await wbot.profilePictureUrl(jidForPic, "image");
          } catch (e) {
            Sentry.captureException(e);
            profilePicUrl = `${getFrontendUrl()}/nopicture.png`;
          }
          contact.profilePicUrl = profilePicUrl;
          updateImage = true;
        }
      }

      await contact.save();
      await contact.reload();

    } else if (['whatsapp'].includes(channel)) {
      // Criação de novo contato WhatsApp (com ou sem instância wbot ativa)
      const settings = await CompaniesSettings.findOne({ where: { companyId } });
      const acceptAudioMessageContact = settings?.acceptAudioMessageContact;
      let newRemoteJid = remoteJid;

      if (!newRemoteJid) {
        newRemoteJid = isGroup ? `${rawNumber}@g.us` : `${number}@s.whatsapp.net`;
      }

      if (wbot) {
        try {
          profilePicUrl = await wbot.profilePictureUrl(newRemoteJid, "image");
        } catch (e) {
          Sentry.captureException(e);
          profilePicUrl = `${getFrontendUrl()}/nopicture.png`;
        }
      } else {
        profilePicUrl = profilePicUrl || `${getFrontendUrl()}/nopicture.png`;
      }

      contact = await Contact.create({
        name: contactName,
        number,
        email,
        isGroup,
        companyId,
        channel,
        acceptAudioMessage: acceptAudioMessageContact === 'enabled' ? true : false,
        remoteJid: newRemoteJid,
        profilePicUrl,
        urlPicture: "",
        whatsappId
      });

      createContact = true;

    } else if (['facebook', 'instagram'].includes(channel)) {
      contact = await Contact.create({
        name: contactName,
        number,
        email,
        isGroup,
        companyId,
        channel,
        profilePicUrl,
        urlPicture: "",
        whatsappId
      });
      createContact = true;
    }

    // Download de imagem 
    if (updateImage) {
      let filename = await downloadProfileImage({
        profilePicUrl,
        companyId,
        contact
      });

      await contact.update({
        urlPicture: filename,
        pictureUpdated: true
      });

      await contact.reload();
    } else if (['facebook', 'instagram'].includes(channel)) {
      let filename = await downloadProfileImage({
        profilePicUrl,
        companyId,
        contact
      });

      await contact.update({
        urlPicture: filename,
        pictureUpdated: true
      });

      await contact.reload();
    }

    // Emissão de socket
    if (createContact) {
      io.of(String(companyId))
        .emit(`company-${companyId}-contact`, {
          action: "create",
          contact
        });
    } else {
      io.of(String(companyId))
        .emit(`company-${companyId}-contact`, {
          action: "update",
          contact
        });
    }

    return contact;
  } catch (err) {
    logger.error("Error to find or create a contact:", err);
    throw err;
  }
};

export default CreateOrUpdateContactService;