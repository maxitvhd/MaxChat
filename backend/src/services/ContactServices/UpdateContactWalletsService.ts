import AppError from "../../errors/AppError";
import Contact from "../../models/Contact";
import ContactWallet from "../../models/ContactWallet";

interface Request {
  wallets: number[] | string[];
  contactId: string;
  companyId: string | number;
}

interface Wallet {
  walletId: number;
  contactId: number;
  companyId: number;
}

const UpdateContactWalletsService = async ({
  wallets,
  contactId,
  companyId
}: Request): Promise<Contact> => {
  await ContactWallet.destroy({
    where: {
      companyId,
      contactId
    }
  });

  const contactWallets: Wallet[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
wallets.forEach((wallet: any) => {
      contactWallets.push({
        walletId: Number(!wallet.id ? wallet : wallet.id),
        contactId: Number(contactId),
        companyId: Number(companyId)
      });
    });

  await ContactWallet.bulkCreate(contactWallets);

  const contact = await Contact.findOne({
    where: { id: contactId, companyId },
    attributes: ["id", "name", "number", "email", "profilePicUrl", "urlPicture", "companyId"],
    include: [
      "extraInfo",
      "tags",
      {
        association: "wallets",
        attributes: ["id", "name"]
      }
    ]
  });

  if (!contact) {
    throw new AppError("ERR_NO_CONTACT_FOUND", 404);
  }

  return contact;
};

export default UpdateContactWalletsService;
