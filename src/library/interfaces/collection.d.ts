import { IResource } from './resource';

export interface ICollection extends Array<IResource> {
    $length: number;
    $isloading: boolean;
    $source: string;
    $cache_last_update: number;
    data: Array<IDataResource>; // this need disapear is for datacollection
}
