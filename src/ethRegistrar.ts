// Import types and APIs from graph-ts
import { BigInt, ByteArray, Bytes, crypto, ens, log } from "@graphprotocol/graph-ts";

import {
  checkValidLabel,
  concat,
  createEventID,
  ETH_NODE,
  uint256ToByteArray,
} from "./utils";

// Import event types from the registry contract ABI
import {
  NameRegistered as NameRegisteredEvent,
  NameRenewed as NameRenewedEvent,
  Transfer as TransferEvent,
} from "./types/BaseRegistrar/BaseRegistrar";

import {
  NameRegistered as ControllerNameRegisteredEvent,
  NameRenewed as ControllerNameRenewedEvent,
} from "./types/EthRegistrarController/EthRegistrarController";

// Import entity types generated from the GraphQL schema
import {
  Account,
  Domain,
  NameRegistered,
  NameRenewed,
  NameTransferred,
  Registration,
} from "./types/schema";

const GRACE_PERIOD_SECONDS = BigInt.fromI32(7776000); // 90 days

const FACET_ETH_NODE = "0x989e4539d443b3938e18a18fedbb006a952f3b42bb47004fe1bfd15da58728e1";
var rootNode: ByteArray = ByteArray.fromHexString(FACET_ETH_NODE);

export function handleNameRegistered(event: NameRegisteredEvent): void {
  log.debug(
    'Starting handleNameRegistered. id: {}, label: {}, owner: {}, expires: {}', 
    [
      event.params.id.toString(),
      uint256ToByteArray(event.params.id).toHexString(),
      event.params.owner.toHexString(),
      event.params.expires.toString()
    ]
  );
  
  let account = new Account(event.params.owner.toHex());
  account.save();

  let label = uint256ToByteArray(event.params.id);
  let registration = new Registration(label.toHex());
  let domain = Domain.load(crypto.keccak256(concat(rootNode, label)).toHex())!;

  registration.domain = domain.id;
  registration.registrationDate = event.block.timestamp;
  registration.expiryDate = event.params.expires;
  registration.registrant = account.id;

  domain.registrant = account.id;
  domain.expiryDate = event.params.expires.plus(GRACE_PERIOD_SECONDS);

  domain.save();
  registration.save();

  let registrationEvent = new NameRegistered(createEventID(event));
  registrationEvent.registration = registration.id;
  registrationEvent.blockNumber = event.block.number.toI32();
  registrationEvent.transactionID = event.transaction.hash;
  registrationEvent.registrant = account.id;
  registrationEvent.expiryDate = event.params.expires;
  registrationEvent.save();
}

export function handleNameRegisteredByController(
  event: ControllerNameRegisteredEvent
): void {
  log.debug(
    'starting handleNameRegisteredByController: name={}, label={}, owner={}, cost={}', 
    [
      event.params.name,
      event.params.label.toHexString(),
      event.params.owner.toHexString(),
      event.params.baseCost.toString()
    ]
  );
  
  setNamePreimage(
    event.params.name,
    event.params.label,
    event.params.baseCost.plus(event.params.premium)
  );
}

export function handleNameRenewedByController(
  event: ControllerNameRenewedEvent
): void {
  setNamePreimage(event.params.name, event.params.label, event.params.cost);
}

function setNamePreimage(name: string, label: Bytes, cost: BigInt): void {
  log.debug('Setting name preimage: name={}, label={}', [name, label.toHexString()]);
  
  if (!checkValidLabel(name)) {
    return;
  }

  let domain = Domain.load(crypto.keccak256(concat(rootNode, label)).toHex())!;
  if (domain.labelName != name) {
    domain.labelName = name;
    domain.name = name + ".facet.eth";
    domain.save();
  }

  let registration = Registration.load(label.toHex());
  if (registration == null) return;
  registration.labelName = name;
  registration.cost = cost;
  registration.save();
}

export function handleNameRenewed(event: NameRenewedEvent): void {
  let label = uint256ToByteArray(event.params.id);
  let registration = Registration.load(label.toHex())!;
  let domain = Domain.load(crypto.keccak256(concat(rootNode, label)).toHex())!;

  registration.expiryDate = event.params.expires;
  domain.expiryDate = event.params.expires.plus(GRACE_PERIOD_SECONDS);

  registration.save();
  domain.save();

  let registrationEvent = new NameRenewed(createEventID(event));
  registrationEvent.registration = registration.id;
  registrationEvent.blockNumber = event.block.number.toI32();
  registrationEvent.transactionID = event.transaction.hash;
  registrationEvent.expiryDate = event.params.expires;
  registrationEvent.save();
}

export function handleNameTransferred(event: TransferEvent): void {
  let account = new Account(event.params.to.toHex());
  account.save();

  let label = uint256ToByteArray(event.params.tokenId);
  let registration = Registration.load(label.toHex());
  if (registration == null) return;

  let domain = Domain.load(crypto.keccak256(concat(rootNode, label)).toHex())!;

  registration.registrant = account.id;
  domain.registrant = account.id;

  domain.save();
  registration.save();

  let transferEvent = new NameTransferred(createEventID(event));
  transferEvent.registration = label.toHex();
  transferEvent.blockNumber = event.block.number.toI32();
  transferEvent.transactionID = event.transaction.hash;
  transferEvent.newOwner = account.id;
  transferEvent.save();
}
