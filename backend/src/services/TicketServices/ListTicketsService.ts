import { Op, fn, where, col, Filterable, Includeable, literal } from "sequelize";
import { startOfDay, endOfDay, parseISO } from "date-fns";

import Ticket from "../../models/Ticket";
import Contact from "../../models/Contact";
import Message from "../../models/Message";
import Queue from "../../models/Queue";
import User from "../../models/User";
import ShowUserService from "../UserServices/ShowUserService";
import Tag from "../../models/Tag";

import { intersection } from "lodash";
import Whatsapp from "../../models/Whatsapp";
import ContactTag from "../../models/ContactTag";

import removeAccents from "remove-accents";

import FindCompanySettingOneService from "../CompaniesSettings/FindCompanySettingOneService";
import { findExistingContact } from "../ContactServices/CreateOrUpdateContactService";
import { consolidateAndFindContactTicket } from "./FindOrCreateTicketService";

// Gera uma chave canônica para números brasileiros (DDI 55 + DDD + 8 últimos dígitos)
// para identificar contatos duplicados com/sem 9º dígito
const getCanonicalPhoneKey = (rawNumber?: string): string => {
  const digits = (rawNumber || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("55") && digits.length === 13 && digits[4] === "9") {
    return digits.slice(0, 4) + digits.slice(5);
  }
  if (!digits.startsWith("55") && digits.length === 11 && digits[2] === "9") {
    return "55" + digits.slice(0, 2) + digits.slice(3);
  }
  if (!digits.startsWith("55") && digits.length === 10) {
    return "55" + digits;
  }
  return digits;
};

interface Request {
  searchParam?: string;
  pageNumber?: string;
  status?: string;
  date?: string;
  dateStart?: string;
  dateEnd?: string;
  updatedAt?: string;
  showAll?: string;
  userId: number;
  withUnreadMessages?: string;
  queueIds: number[];
  tags: number[];
  users: number[];
  contacts?: string[];
  updatedStart?: string;
  updatedEnd?: string;
  connections?: string[];
  whatsappIds?: number[];
  statusFilters?: string[];
  queuesFilter?: string[];
  isGroup?: string;
  companyId: number;
  allTicket?: string;
  sortTickets?: string;
  searchOnMessages?: string;
}

interface Response {
  tickets: Ticket[];
  count: number;
  hasMore: boolean;
}

const ListTicketsService = async ({
  searchParam = "",
  pageNumber = "1",
  queueIds,
  tags,
  users,
  status,
  date,
  dateStart,
  dateEnd,
  updatedAt,
  showAll,
  userId,
  withUnreadMessages = "false",
  whatsappIds,
  statusFilters,
  companyId,
  sortTickets = "DESC",
  searchOnMessages = "false"
}: Request): Promise<Response> => {
  const user = await ShowUserService(userId, companyId);

  const showTicketAllQueues = user.allHistoric === "enabled";
  const showTicketWithoutQueue = user.allTicket === "enable";
  const showGroups = user.allowGroup === true;
  const showPendingNotification = await FindCompanySettingOneService({ companyId, column: "showNotificationPending" });
  const showNotificationPendingValue = showPendingNotification[0].showNotificationPending;
    let whereCondition: Filterable["where"];

  whereCondition = {
    [Op.or]: [{ userId }, { status: "pending" }],
    queueId: showTicketWithoutQueue ? { [Op.or]: [queueIds, null] } : { [Op.or]: [queueIds] },
    companyId
  };


  let includeCondition: Includeable[];

  includeCondition = [
    {
      model: Contact,
      as: "contact",
      attributes: ["id", "name", "number", "email", "profilePicUrl", "acceptAudioMessage", "active", "urlPicture", "companyId"],
      include: ["extraInfo", "tags"]
    },
    {
      model: Queue,
      as: "queue",
      attributes: ["id", "name", "color"]
    },
    {
      model: User,
      as: "user",
      attributes: ["id", "name"]
    },
    {
      model: Tag,
      as: "tags",
      attributes: ["id", "name", "color"]
    },
    {
      model: Whatsapp,
      as: "whatsapp",
      attributes: ["id", "name", "expiresTicket", "groupAsTicket"]
    },
  ];

  const userQueueIds = user.queues.map(queue => queue.id);

  if (status === "open") {
    whereCondition = {
      ...whereCondition,
      userId,
      queueId: { [Op.in]: queueIds }
    };
  } else
    if (status === "group" && user.allowGroup && user.whatsappId) {
      whereCondition = {
        companyId,
        queueId: { [Op.or]: [queueIds, null] },
        whatsappId: user.whatsappId
      };
    }
    else
      if (status === "group" && (user.allowGroup) && !user.whatsappId) {
        whereCondition = {
          companyId,
          queueId: { [Op.or]: [queueIds, null] },
        };
      }
      else
        if (user.profile === "user" && status === "pending" && showTicketWithoutQueue) {
          const TicketsUserFilter: any[] | null = [];

          let ticketsIds = [];

          if (!showTicketAllQueues) {
            ticketsIds = await Ticket.findAll({
              where: {
                userId: { [Op.or]: [user.id, null] },
                queueId: { [Op.or]: [queueIds, null] },
                status: "pending",
                companyId
              },
            });
          } else {
            ticketsIds = await Ticket.findAll({
              where: {
                userId: { [Op.or]: [user.id, null] },
                // queueId: { [Op.or]: [queueIds, null] },
                status: "pending",
                companyId
              },
            });
          }

          if (ticketsIds) {
            TicketsUserFilter.push(ticketsIds.map(t => t.id));
          }
          // }

          const ticketsIntersection: number[] = intersection(...TicketsUserFilter);

          whereCondition = {
            ...whereCondition,
            id: ticketsIntersection
          };
        }
        else
          if (user.profile === "user" && status === "pending" && !showTicketWithoutQueue) {
            const TicketsUserFilter: any[] | null = [];

            let ticketsIds = [];

            if (!showTicketAllQueues) {
              ticketsIds = await Ticket.findAll({
                where: {
                  companyId,
                  userId:
                    { [Op.or]: [user.id, null] },
                  status: "pending",
                  queueId: { [Op.in]: queueIds }
                },
              });
            } else {
              ticketsIds = await Ticket.findAll({
                where: {
                  companyId,
                  [Op.or]:
                    [{
                      userId:
                        { [Op.or]: [user.id, null] }
                    },
                    {
                      status: "pending"
                    }
                    ],
                  // queueId: { [Op.in] : queueIds},
                  status: "pending"
                },
              });
            }
            if (ticketsIds) {
              TicketsUserFilter.push(ticketsIds.map(t => t.id));
            }
            // }

            const ticketsIntersection: number[] = intersection(...TicketsUserFilter);

            whereCondition = {
              ...whereCondition,
              id: ticketsIntersection
            };
          }

  if (showAll === "true" && (user.profile === "admin" || user.allUserChat === "enabled") && status !== "search") {
    if (user.allHistoric === "enabled" && showTicketWithoutQueue) {
      whereCondition = { companyId };
    } else if (user.allHistoric === "enabled" && !showTicketWithoutQueue) {
      whereCondition = { companyId, queueId: { [Op.ne]: null } };
    } else if (user.allHistoric === "disabled" && showTicketWithoutQueue) {
      whereCondition = { companyId, queueId: { [Op.or]: [queueIds, null] } };
    } else if (user.allHistoric === "disabled" && !showTicketWithoutQueue) {
      whereCondition = { companyId, queueId: queueIds };
    }
  }


  if (status && status !== "search") {
    whereCondition = {
      ...whereCondition,
      status: showAll === "true" && status === "pending" ? { [Op.or]: [status, "lgpd"] } : status
    };
  }


  if (status === "closed") {
    let latestTickets;

    if (!showTicketAllQueues) {
      let whereCondition2: Filterable["where"] = {
        companyId,
        status: "closed",
      }

      if (showAll === "false" && user.profile === "admin") {
        whereCondition2 = {
          ...whereCondition2,
          queueId: queueIds,
          userId
        }
      } else {
        whereCondition2 = {
          ...whereCondition2,
          queueId: showAll === "true" || showTicketWithoutQueue ? { [Op.or]: [queueIds, null] } : queueIds,
        }
      }

      latestTickets = await Ticket.findAll({
        attributes: ['companyId', 'contactId', [literal('MAX("id")'), 'id']],
        where: whereCondition2,
        group: ['companyId', 'contactId'],
      });

    } else {
      let whereCondition2: Filterable["where"] = {
        companyId,
        status: "closed",
      }

      if (showAll === "false" && (user.profile === "admin" || user.allUserChat === "enabled")) {
        whereCondition2 = {
          ...whereCondition2,
          queueId: queueIds,
          userId
        }
      } else {
        whereCondition2 = {
          ...whereCondition2,
          queueId: showAll === "true" || showTicketWithoutQueue ? { [Op.or]: [queueIds, null] } : queueIds,
        }
      }

      latestTickets = await Ticket.findAll({
        attributes: ['companyId', 'contactId', [literal('MAX("id")'), 'id']],
        where: whereCondition2,
        group: ['companyId', 'contactId'],
      });

    }

    const ticketIds = latestTickets.map((t) => t.id);

    whereCondition = {
      id: ticketIds

    };
  }
  else
    if (status === "search") {
      whereCondition = {
        companyId
      }
      let latestTickets;
      if (!showTicketAllQueues && user.profile === "user") {
        latestTickets = await Ticket.findAll({
          attributes: ['companyId', 'contactId', [literal('MAX("id")'), 'id']],
          where: {
            [Op.or]: [{ userId }, { status: ["pending", "closed", "group"] }],
            queueId: showAll === "true" || showTicketWithoutQueue ? { [Op.or]: [queueIds, null] } : queueIds,
            companyId
          },
          group: ['companyId', 'contactId'],
        });
      } else {
        let whereCondition2: Filterable["where"] = {
          companyId,
          [Op.or]: [{ userId }, { status: ["pending", "closed", "group"] }]
        }

        if (showAll === "false" && user.profile === "admin") {
          whereCondition2 = {
            ...whereCondition2,
            queueId: queueIds,

            // [Op.or]: [{ userId }, { status: ["pending", "closed", "group"] }],
          }

        } else if (showAll === "true" && user.profile === "admin") {
          whereCondition2 = {
            companyId,
            queueId: { [Op.or]: [queueIds, null] },
            // status: ["pending", "closed", "group"]
          }
        }

        latestTickets = await Ticket.findAll({
          attributes: ['companyId', 'contactId', [literal('MAX("id")'), 'id']],
          where: whereCondition2,
          group: ['companyId', 'contactId'],
        });

      }

      const ticketIds = latestTickets.map((t) => t.id);

      whereCondition = {
        ...whereCondition,
        id: ticketIds
      };

      // if (date) {
      //   whereCondition = {
      //     createdAt: {
      //       [Op.between]: [+startOfDay(parseISO(date)), +endOfDay(parseISO(date))]
      //     }
      //   };
      // }

      // if (dateStart && dateEnd) {
      //   whereCondition = {
      //     updatedAt: {
      //       [Op.between]: [+startOfDay(parseISO(dateStart)), +endOfDay(parseISO(dateEnd))]
      //     }
      //   };
      // }

      // if (updatedAt) {
      //   whereCondition = {
      //     updatedAt: {
      //       [Op.between]: [
      //         +startOfDay(parseISO(updatedAt)),
      //         +endOfDay(parseISO(updatedAt))
      //       ]
      //     }
      //   };
      // }


      if (searchParam) {
        const sanitizedSearchParam = removeAccents(searchParam.toLocaleLowerCase().trim());
        if (searchOnMessages === "true") {
          includeCondition = [
            ...includeCondition,
            {
              model: Message,
              as: "messages",
              attributes: ["id", "body"],
              where: {
                body: where(
                  fn("LOWER", fn('unaccent', col("body"))),
                  "LIKE",
                  `%${sanitizedSearchParam}%`
                ),
                // ticketId: 
              },
              required: false,
              duplicating: false
            }
          ];
          whereCondition = {
            ...whereCondition,
            [Op.or]: [
              where(
                col("contact.number"),
                { [Op.like]: `%${sanitizedSearchParam}%` }
              )
            ]
          };
        } else {
          whereCondition = {
            ...whereCondition,
            [Op.or]: [
              where(
                col("contact.number"),
                { [Op.like]: `%${sanitizedSearchParam}%` }
              )
            ]
          };
        }

      }

      if (Array.isArray(tags) && tags.length > 0) {
        const contactTagFilter: any[] | null = [];
        // for (let tag of tags) {
        const contactTags = await ContactTag.findAll({
          where: { tagId: tags }
        });
        if (contactTags) {
          contactTagFilter.push(contactTags.map(t => t.contactId));
        }
        // }

        const contactsIntersection: number[] = intersection(...contactTagFilter);

        whereCondition = {
          ...whereCondition,
          contactId: contactsIntersection
        };
      }

      if (Array.isArray(users) && users.length > 0) {
        whereCondition = {
          ...whereCondition,
          userId: users
        };
      }


      if (Array.isArray(whatsappIds) && whatsappIds.length > 0) {
        whereCondition = {
          ...whereCondition,
          whatsappId: whatsappIds
        };
      }

      if (Array.isArray(statusFilters) && statusFilters.length > 0) {
        whereCondition = {
          ...whereCondition,
          status: { [Op.in]: statusFilters }
        };
      }

    } else
      if (withUnreadMessages === "true") {
        // 
        whereCondition = {
          [Op.or]: [
            {
              userId,
              status: showNotificationPendingValue ? { [Op.notIn]: ["closed", "lgpd", "nps"] } : { [Op.notIn]: ["pending", "closed", "lgpd", "nps", "group"] },
              queueId: { [Op.in]: userQueueIds },
              unreadMessages: { [Op.gt]: 0 },
              companyId,
              isGroup: showGroups ? { [Op.or]: [true, false] } : false
            },
            {
              status: showNotificationPendingValue ? { [Op.in]: ["pending", "group"] } : { [Op.in]: ["group"] },
              queueId: showTicketWithoutQueue ? { [Op.or]: [userQueueIds, null] } : { [Op.or]: [userQueueIds] },
              unreadMessages: { [Op.gt]: 0 },
              companyId,
              isGroup: showGroups ? { [Op.or]: [true, false] } : false
            }
          ]
        };

        if (status === "group" && (user.allowGroup || showAll === "true")) {
          whereCondition = {
            ...whereCondition,
            queueId: { [Op.or]: [userQueueIds, null] },
          };
        }
      }

  // Antes de listar abertos/pendentes, verifica se existem tickets ativos duplicados para o mesmo
  // contato (ou contatos duplicados com mesmo telefone) e os consolida automaticamente em uma única conversa
  if (status === "open" || status === "pending") {
    const activeCompanyTickets = await Ticket.findAll({
      where: {
        companyId,
        isGroup: false,
        status: { [Op.in]: ["open", "pending", "lgpd", "nps"] }
      },
      attributes: ["id", "contactId", "status", "updatedAt"],
      include: [
        {
          model: Contact,
          as: "contact",
          attributes: ["id", "name", "number", "remoteJid"]
        }
      ]
    });

    const groupsByContactOrPhone = new Map<string, Ticket[]>();
    const groupsByName = new Map<string, Ticket[]>();

    for (const t of activeCompanyTickets) {
      const phoneKey = getCanonicalPhoneKey(t.contact?.number);
      const key = phoneKey || `contact_${t.contactId}`;
      const list = groupsByContactOrPhone.get(key) || [];
      list.push(t);
      groupsByContactOrPhone.set(key, list);

      const cleanName = t.contact?.name ? t.contact.name.trim().toLowerCase() : "";
      if (cleanName.length >= 2 && !/^\d+$/.test(cleanName)) {
        const nameList = groupsByName.get(cleanName) || [];
        nameList.push(t);
        groupsByName.set(cleanName, nameList);
      }
    }

    const duplicateGroups: Ticket[][] = [];
    for (const [, group] of groupsByContactOrPhone.entries()) {
      if (group.length > 1) duplicateGroups.push(group);
    }
    for (const [, group] of groupsByName.entries()) {
      if (group.length > 1) duplicateGroups.push(group);
    }

    for (const group of duplicateGroups) {
      const sample = group[0];
      const primaryContact = await findExistingContact({
        companyId,
        name: sample.contact?.name,
        number: sample.contact?.number,
        remoteJid: sample.contact?.remoteJid,
        isGroup: false
      });
      const targetContactId = primaryContact ? primaryContact.id : sample.contactId;
      await consolidateAndFindContactTicket(targetContactId, companyId);
    }
  }

  whereCondition = {
    ...whereCondition,
    companyId
  };

  const limit = 40;
  const offset = limit * (+pageNumber - 1);

  const { count, rows: tickets } = await Ticket.findAndCountAll({
    where: whereCondition,
    include: includeCondition,
    attributes: ["id", "uuid", "userId", "queueId", "isGroup", "channel", "status", "contactId", "useIntegration", "lastMessage", "updatedAt", "unreadMessages"],
    distinct: true,
    limit,
    offset,
    order: [["updatedAt", sortTickets]],
    subQuery: false
  });

  const hasMore = count > offset + tickets.length;

  return {
    tickets,
    count,
    hasMore
  };
};

export default ListTicketsService;
