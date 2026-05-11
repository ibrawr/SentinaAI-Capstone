"""
Computes shortest paths on the navigation graph using Dijkstra's algorithm
and supports dynamic edge weight updates.
"""

from __future__ import annotations

import heapq
from typing import Dict, List, Optional, Tuple


class DijkstraPathfinder:
    """Dijkstra pathfinder with support for dynamic edge weights."""

    def __init__(self, nodes: List[Dict], edges: List[Dict]):
        self.nodes: Dict[str, Dict] = {n["id"]: n for n in nodes}
        self.edges: List[Dict] = edges
        self.graph: Dict[str, List[Tuple[str, float]]] = self._build_adjacency_list()

    def _build_adjacency_list(self) -> Dict[str, List[Tuple[str, float]]]:
        graph: Dict[str, List[Tuple[str, float]]] = {node_id: [] for node_id in self.nodes.keys()}
        for e in self.edges:
            a = e["from"]
            b = e["to"]
            w = float(e.get("effective_weight", e.get("weight", 1.0)))
            if a in graph:
                graph[a].append((b, w))
            if b in graph:
                graph[b].append((a, w))
        return graph

    def update_weights(self, updated_edges: List[Dict]) -> None:
        self.edges = updated_edges
        self.graph = self._build_adjacency_list()

    def find_path(self, start_id: str, goal_id: str) -> Optional[List[str]]:
        if start_id not in self.nodes or goal_id not in self.nodes:
            return None

        dist: Dict[str, float] = {node_id: float("inf") for node_id in self.nodes.keys()}
        prev: Dict[str, str] = {}

        dist[start_id] = 0.0
        pq: List[Tuple[float, str]] = [(0.0, start_id)]

        visited = set()

        while pq:
            cur_dist, cur = heapq.heappop(pq)
            if cur in visited:
                continue
            visited.add(cur)

            if cur == goal_id:
                break

            for nb, w in self.graph.get(cur, []):
                if nb in visited:
                    continue
                nd = cur_dist + float(w)
                if nd < dist[nb]:
                    dist[nb] = nd
                    prev[nb] = cur
                    heapq.heappush(pq, (nd, nb))

        if goal_id not in prev and goal_id != start_id:
            return None

        return self._reconstruct(prev, start_id, goal_id)

    @staticmethod
    def _reconstruct(prev: Dict[str, str], start: str, goal: str) -> List[str]:
        path = [goal]
        cur = goal
        while cur != start:
            cur = prev.get(cur)
            if cur is None:
                return []
            path.append(cur)
        path.reverse()
        return path

    def get_path_distance(self, path: List[str]) -> float:
        if not path or len(path) < 2:
            return 0.0
        total = 0.0
        for i in range(len(path) - 1):
            a = path[i]
            b = path[i + 1]
            w = None
            for nb, wt in self.graph.get(a, []):
                if nb == b:
                    w = wt
                    break
            if w is None:
                return float("inf")
            total += float(w)
        return float(total)
