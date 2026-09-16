import { QueryInterface, DataTypes, fn, col } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const indexNamesTicket = (await queryInterface.showIndex("Tickets")) as any[];
    const indexNamesContact = (await queryInterface.showIndex("Contacts")) as any[];
    const indexNamesMessage = (await queryInterface.showIndex("Messages")) as any[];
    const indexNamesTicketTraking = (await queryInterface.showIndex("TicketTraking")) as any[];
    const indexNamesLogTickets = (await queryInterface.showIndex("LogTickets")) as any[];
    const indexNamesContactCustomFields = (await queryInterface.showIndex("ContactCustomFields")) as any[];
    const indexNamesTicketTags = (await queryInterface.showIndex("TicketTags")) as any[];

    if (
      !indexNamesTicket.some(
        (index: any) => index.name === "idx_ticket_company_id_status_updatedAt"
      )
    ) {
      await queryInterface.addIndex("Tickets", {
        name: "idx_ticket_company_id_status_updatedAt",
        fields: [
          "companyId",
          "status",
          { name: "updatedAt", order: "DESC" }
        ]
      });
    }

    if (
      !indexNamesContact.some(
        (index: any) => index.name === "idx_contact_company_id_lower_name"
      )
    ) {
      await queryInterface.addIndex("Contacts", {
        name: "idx_contact_company_id_lower_name",
        fields: [fn("LOWER", col("name")), "companyId"]
      });
    }

    if (
      !indexNamesMessage.some(
        (index: any) => index.name === "idx_message_ticket_id_company_createdAt"
      )
    ) {
      await queryInterface.addIndex(
        "Messages",
        ["ticketId", "companyId", "createdAt"],
        { name: "idx_message_ticket_id_company_createdAt" }
      );
    }

    if (
      !indexNamesTicketTraking.some(
        (index: any) => index.name === "idx_ticketTraking_company_id_user_id"
      )
    ) {
      await queryInterface.addIndex(
        "TicketTraking",
        ["companyId", "userId"],
        { name: "idx_ticketTraking_company_id_user_id" }
      );
    }

    if (
      !indexNamesLogTickets.some(
        (index: any) => index.name === "idx_logTickets_ticket_id"
      )
    ) {
      await queryInterface.addIndex("LogTickets", ["ticketId"], {
        name: "idx_logTickets_ticket_id"
      });
    }

    if (
      !indexNamesContactCustomFields.some(
        (index: any) => index.name === "idx_contactCustomFields_contact_id"
      )
    ) {
      await queryInterface.addIndex(
        "ContactCustomFields",
        ["contactId"],
        { name: "idx_contactCustomFields_contact_id" }
      );
    }

    if (
      !indexNamesTicketTags.some(
        (index: any) => index.name === "idx_ticketTags_ticketId_tagId"
      )
    ) {
      await queryInterface.addIndex(
        "TicketTags",
        ["ticketId", "tagId"],
        { name: "idx_ticketTags_ticketId_tagId" }
      );
    }
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeIndex("Tickets", "idx_ticket_company_id_status_updatedAt");
    await queryInterface.removeIndex("Contacts", "idx_contact_company_id_lower_name");
    await queryInterface.removeIndex("Messages", "idx_message_ticket_id_company_createdAt");
    await queryInterface.removeIndex("TicketTraking", "idx_ticketTraking_company_id_user_id");
    await queryInterface.removeIndex("LogTickets", "idx_logTickets_ticket_id");
    await queryInterface.removeIndex("ContactCustomFields", "idx_contactCustomFields_contact_id");
    await queryInterface.removeIndex("TicketTags", "idx_ticketTags_ticketId_tagId");
  }
};