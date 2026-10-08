import * as T from "@tabler/icons-react";
import type { ComponentType } from "react";

type Props = { size?: number; stroke?: number; className?: string };

/* Los íconos que se pueden elegir para una categoría, por nombre. El nombre es lo
   que se guarda, así la categoría no depende del componente. */
export const ICONOS: Record<string, ComponentType<Props>> = {
  "home": T.IconHome, "shopping-cart": T.IconShoppingCart, "wallet": T.IconWallet, "coffee": T.IconCoffee,
  "basket": T.IconBasket, "bus": T.IconBus, "heartbeat": T.IconHeartbeat, "barbell": T.IconBarbell,
  "shirt": T.IconShirt, "plane": T.IconPlane, "receipt": T.IconReceipt, "star": T.IconStar,
  "gift": T.IconGift, "school": T.IconSchool, "scissors": T.IconScissors, "world": T.IconWorld,
  "cash": T.IconCash, "question-mark": T.IconQuestionMark, "briefcase": T.IconBriefcase,
  "home-dollar": T.IconHomeDollar, "trending-up": T.IconTrendingUp, "coin": T.IconCoin,
  "building": T.IconBuilding, "bolt": T.IconBolt, "paw": T.IconPaw, "car": T.IconCar,
  "gamepad": T.IconDeviceGamepad2, "book": T.IconBook, "first-aid": T.IconFirstAidKit, "devices": T.IconDevices,
  "kitchen": T.IconToolsKitchen2, "brush": T.IconBrush, "wash": T.IconWashMachine, "tent": T.IconTent,
  "shoe": T.IconShoe, "pig": T.IconPigMoney, "music": T.IconMusic, "movie": T.IconMovie,
  "beer": T.IconBeer, "pizza": T.IconPizza, "baby": T.IconBabyCarriage, "dog": T.IconDog,
  "gas": T.IconGasStation, "wifi": T.IconWifi, "phone": T.IconPhone, "droplet": T.IconDroplet,
  "flame": T.IconFlame, "bank": T.IconBuildingBank, "credit-card": T.IconCreditCard, "heart": T.IconHeart,
  "ball": T.IconBallFootball, "ticket": T.IconTicket, "store": T.IconBuildingStore, "bike": T.IconBike,
  "train": T.IconTrain, "medicine": T.IconMedicineSyrup, "dental": T.IconDental, "plant": T.IconPlant,
  "cat": T.IconCat, "cake": T.IconCake, "glass": T.IconGlass, "tv": T.IconDeviceTv,
  "percentage": T.IconPercentage, "report-money": T.IconReportMoney, "certificate": T.IconCertificate, "happy": T.IconMoodHappy, "users": T.IconUsers,
};

export function Icono({ nombre, size = 18, className }: { nombre: string; size?: number; className?: string }) {
  const C = ICONOS[nombre] ?? T.IconQuestionMark;
  return <C size={size} stroke={1.7} className={className} />;
}

export { T };
