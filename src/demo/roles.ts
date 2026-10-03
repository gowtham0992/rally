export const demoRoles={ORGANIZER:'Alex',TRAVELER:'Sam',COLLECTOR:'Jordan',FRIEND_ONE:'Riley',FRIEND_TWO:'Casey',FRIEND_THREE:'Taylor',STUDIO:'Willow Studio'} as const;
export type DemoRole=keyof typeof demoRoles;
