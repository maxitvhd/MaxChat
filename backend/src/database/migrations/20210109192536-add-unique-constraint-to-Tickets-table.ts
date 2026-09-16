import { QueryInterface } from "sequelize";

module.exports = {
  up: (queryInterface: QueryInterface) => {
    return queryInterface.addConstraint("Tickets", {
      type: "unique",
      name: "contactid_companyid_whatsappid_unique",
      fields: ["id", "contactId", "companyId", "whatsappId"]
    });
  },

  down: (queryInterface: QueryInterface) => {
    return queryInterface.removeConstraint(
      "Tickets",
      "contactid_companyid_whatsappid_unique"
    );
  }
};
