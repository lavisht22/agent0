import * as openpgp from "openpgp";

export const decryptMessage = async (messageStr) => {
	const privateKey = await openpgp.decryptKey({
		privateKey: await openpgp.readPrivateKey({
			armoredKey: process.env.PGP_PRIVATE_KEY || "",
		}),
		passphrase: process.env.PGP_PRIVATE_KEY_PASSPHRASE || "",
	});

	const message = await openpgp.readMessage({
		armoredMessage: messageStr,
	});

	const { data: decrypted } = await openpgp.decrypt({
		message,
		decryptionKeys: privateKey,
	});

	return decrypted;
};
